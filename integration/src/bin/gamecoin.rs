//! Gamecoin (GC): a public fungible faucet run by a multisig. The signers' keys live in the keystore
//! next to the repo root (`GQ_KEYSTORE` names another one, for a second signer on the same machine).
//! Every transaction of the faucet is a proposal its signers sign; with one signer and a threshold
//! of one, a mint is just a signed mint. Players buy Gamecoin in the app (web/src/lib/shop.ts).
//!
//!   cargo run --release --bin gamecoin deploy <account> <GC>        # once: a 1-of-1 faucet; mints the first GC to <account>, writes the gamecoin file
//!   cargo run --release --bin gamecoin mint <account> <GC>          # signs with the local keys; short of the threshold, writes the proposal file
//!   cargo run --release --bin gamecoin sign                         # co-signs the proposal file with the local keys; submits at the threshold
//!   cargo run --release --bin gamecoin key                          # a new signer key in the keystore (prints its id)
//!   cargo run --release --bin gamecoin signers <threshold> <key>... # the new signer set, a proposal like any other
//!   cargo run --release --bin gamecoin fees                         # testnet: top up the fee balance; mainnet: report it
//!
//! `<account>` is bech32 or hex. `GQ_NETWORK=mainnet` uses the mainnet store, keystore, gamecoin
//! and proposal files; there `deploy` registers the faucet with the invite code in `GQ_INVITE_CODE`,
//! which also funds its fees (the node pays a registered account). The faucet pays the fees of
//! every transaction in the chain's fee asset.

use std::{num::NonZeroU32, time::Instant};

use anyhow::{bail, ensure, Context, Result};
use integration::{
    faucet_api::{request_fee_tokens, TESTNET_FAUCET_API},
    helpers::{gamecoin_file, mainnet, network_id, proposal_file, setup_client, wait_for_commit, NETWORK_TIMEOUT, POLL_INTERVAL},
};
use miden_client::{
    account::{
        standards::{
            access::{Authority, Pausable, PausableManager},
            faucets::{FungibleFaucet, TokenName},
            policies::{BurnPolicy, MintPolicy, TokenPolicyManager},
            wallets::BasicWallet,
        },
        AccountBuilder, AccountId, AccountType, Address,
    },
    asset::{AssetAmount, FungibleAsset, TokenSymbol},
    auth::{AuthSecretKey, PublicKeyCommitment, Signature, SigningInputs, TransactionAuthenticator},
    keystore::{FilesystemKeyStore, Keystore},
    note::{Note, NoteType},
    transaction::{TransactionExecutorError, TransactionRequest, TransactionRequestBuilder},
    Client, ClientError, Felt, Word,
};
use miden_client::{Deserializable, Serializable};
use miden_protocol::{account::auth::AuthScheme, crypto::SequentialCommit, Hasher};
use miden_standards::account::auth::{Approver, ApproverSet, AuthMultisig, AuthMultisigConfig, FeeConversionInfo, MultisigAuthArgs};

use rand::Rng;

const GC_DECIMALS: u8 = 6;
const GC_MAX_SUPPLY: u64 = 100_000_000_000 * 1_000_000; // 100 billion GC
/// Blocks the signatures of a proposal stay valid for (a signer on another machine takes a while).
const APPROVAL_BLOCKS: u32 = 20_000;

type GqClient = Client<FilesystemKeyStore>;

/// The gamecoin file: the faucet and who signs for it (no signers: the old single-key faucet, its key in the keystore).
#[derive(serde::Serialize, serde::Deserialize)]
struct Faucet {
    gamecoin: String,
    #[serde(default)]
    signers: Vec<String>,
    #[serde(default)]
    threshold: u32,
}

impl Faucet {
    fn load() -> Result<Self> {
        let path = gamecoin_file();
        let text = std::fs::read_to_string(&path).with_context(|| path.display().to_string())?;
        serde_json::from_str(&text).context("gamecoin file")
    }
    fn save(&self) -> Result<()> {
        std::fs::write(gamecoin_file(), serde_json::to_string_pretty(self)? + "\n")?;
        Ok(())
    }
    fn id(&self) -> Result<AccountId> {
        Ok(AccountId::from_hex(&self.gamecoin)?)
    }
    fn signer_keys(&self) -> Result<Vec<PublicKeyCommitment>> {
        self.signers.iter().map(|s| Ok(PublicKeyCommitment::from(parse_word(s)?))).collect()
    }
}

/// A transaction waiting for signatures: travels between signers as the proposal file.
#[derive(serde::Serialize, serde::Deserialize)]
struct Proposal {
    what: String,
    request: String,
    summary: String,
    signatures: Vec<(String, String)>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("deploy") if args.len() == 3 => deploy(&args[1], &args[2]).await,
        Some("mint") if args.len() == 3 => mint(&args[1], &args[2]).await,
        Some("sign") => sign().await,
        Some("key") => key().await,
        Some("signers") if args.len() >= 3 => signers(&args[1], &args[2..]).await,
        Some("fees") => fees().await,
        _ => bail!("usage: gamecoin deploy <account> <GC> | mint <account> <GC> | sign | key | signers <threshold> <key>... | fees"),
    }
}

async fn deploy(first_owner: &str, first_gc: &str) -> Result<()> {
    let owner = parse_account(first_owner)?;
    let first = parse_gc(first_gc)?;
    let code = if mainnet() { Some(std::env::var("GQ_INVITE_CODE").context("GQ_INVITE_CODE: mainnet registers the faucet with an invite code")?) } else { None };
    let setup = setup_client().await?;
    let mut client = setup.client;
    client.sync_state().await?;

    let faucet = FungibleFaucet::builder()
        .name(TokenName::new("Gamecoin")?)
        .symbol(TokenSymbol::new("GC")?)
        .decimals(GC_DECIMALS)
        .max_supply(AssetAmount::new(GC_MAX_SUPPLY)?)
        .build()
        .context("build FungibleFaucet")?;
    let policies = TokenPolicyManager::builder()
        .active_mint_policy(MintPolicy::allow_all())
        .active_burn_policy(BurnPolicy::allow_all())
        .build();
    // the first signer; `gamecoin signers` grows the set later
    let key = AuthSecretKey::new_falcon512_poseidon2_with_rng(client.rng());
    let auth = AuthMultisig::new(AuthMultisigConfig::new(ApproverSet::new(vec![Approver::from(&key.public_key())], 1)?))?;

    let mut seed = [0u8; 32];
    client.rng().fill_bytes(&mut seed);
    let account = AccountBuilder::new(seed)
        .account_type(AccountType::Public)
        .with_component(auth)
        .with_component(faucet)
        // the faucet pays its own fees, received as plain P2ID notes
        .with_component(BasicWallet)
        .with_component(Authority::AuthControlled)
        .with_components(policies)
        .with_component(Pausable::unpaused())
        .with_component(PausableManager)
        .build()
        .context("build faucet account")?;
    client.add_account(&account, false).await?;
    setup.keystore.add_key(&key, account.id()).await.context("keystore")?;

    let id = account.id();
    let f = Faucet { gamecoin: id.to_hex(), signers: vec![Word::from(key.public_key().to_commitment()).to_hex()], threshold: 1 };
    f.save()?;
    println!("Gamecoin faucet: {} ({})", id.to_bech32(network_id()), id.to_hex());
    println!("signer {}; wrote {}; set VITE_GC_FAUCET or web/src/config.ts GC_FAUCET to it", f.signers[0], gamecoin_file().display());

    if let Some(code) = code {
        // one code per account; the node answers once its funding note is committed
        println!("Registering the faucet on mainnet ...");
        client.register_account(id, &code).await.context("register_account")?;
    } else {
        println!("Requesting fee tokens for {} ...", id.to_hex());
        println!("faucet note {}", request_fee_tokens(TESTNET_FAUCET_API, id)?);
    }
    take_funding(&mut client, &setup.keystore, &f).await?;
    println!("Faucet is funded for fees.");
    mint_to(&mut client, &setup.keystore, &f, owner, first).await?;
    println!("Minted {first_gc} GC to {}. Mint more with: gamecoin mint <account> <GC>", owner.to_hex());
    Ok(())
}

async fn mint(target: &str, amount_gc: &str) -> Result<()> {
    let f = Faucet::load()?;
    let target_id = parse_account(target)?;
    let amount = parse_gc(amount_gc)?;
    let setup = setup_client().await?;
    let mut client = setup.client;
    client.sync_state().await?;
    if !mainnet() {
        fund_fees(&mut client, &setup.keystore, &f).await?;
    }
    mint_to(&mut client, &setup.keystore, &f, target_id, amount).await
}

async fn mint_to(client: &mut GqClient, keystore: &FilesystemKeyStore, f: &Faucet, target_id: AccountId, amount: u64) -> Result<()> {
    let asset = FungibleAsset::new(f.id()?, amount)?;
    let what = format!("mint {amount} base units to {}", target_id.to_hex());
    let request = base(client, f).await?.build_mint_fungible_asset(asset, target_id, NoteType::Public, client.rng())?;
    propose(client, keystore, f, &what, request).await
}

/// A new signer key in the keystore: `gamecoin signers` puts it to work.
async fn key() -> Result<()> {
    let f = Faucet::load()?;
    let setup = setup_client().await?;
    let mut client = setup.client;
    let key = AuthSecretKey::new_falcon512_poseidon2_with_rng(client.rng());
    setup.keystore.add_key(&key, f.id()?).await.context("keystore")?;
    println!("{}", Word::from(key.public_key().to_commitment()).to_hex());
    Ok(())
}

/// Replaces the signer set: signed by the current signers, in force from the next transaction.
async fn signers(threshold: &str, keys: &[String]) -> Result<()> {
    let f = Faucet::load()?;
    let threshold: u32 = threshold.parse()?;
    ensure!(threshold >= 1 && threshold as usize <= keys.len(), "threshold must be between 1 and the number of keys");
    let next = Faucet { gamecoin: f.gamecoin.clone(), signers: keys.to_vec(), threshold };
    let pks = next.signer_keys()?;
    // [threshold, n, 0, 0] then (KEY, SCHEME) per signer, last first (the procedure pops them in index order)
    let mut v = vec![Felt::from(threshold), Felt::from(keys.len() as u32), Felt::ZERO, Felt::ZERO];
    for pk in pks.iter().rev() {
        v.extend_from_slice(Word::from(*pk).as_elements());
        v.extend_from_slice(&[Felt::from(AuthScheme::Falcon512Poseidon2.as_u8()), Felt::ZERO, Felt::ZERO, Felt::ZERO]);
    }
    let hash = Hasher::hash_elements(&v);

    let setup = setup_client().await?;
    let mut client = setup.client;
    client.sync_state().await?;
    let script = client
        .code_builder()
        .with_dynamically_linked_package(AuthMultisig::code())?
        .compile_tx_script("@transaction_script\npub proc main\n    call.::miden::standards::components::auth::multisig::update_signers_and_threshold\nend")?;
    let what = format!("signers {threshold} of {}", keys.len());
    let request = base(&mut client, &f).await?.custom_script(script).script_arg(hash).extend_advice_map([(hash, v)]).build()?;
    propose(&mut client, &setup.keystore, &f, &what, request).await?;
    next.save()?;
    println!("wrote {}", gamecoin_file().display());
    Ok(())
}

/// Co-signs the proposal file with the local keys and submits once the threshold is met.
async fn sign() -> Result<()> {
    let f = Faucet::load()?;
    let path = proposal_file();
    let p: Proposal = serde_json::from_str(&std::fs::read_to_string(&path).with_context(|| path.display().to_string())?)?;
    let setup = setup_client().await?;
    let mut client = setup.client;
    client.sync_state().await?;
    advance(&mut client, &setup.keystore, &f, p).await
}

/// A request builder carrying the multisig arguments: the bound block, a fresh salt and the fee conversion.
async fn base(client: &mut GqClient, f: &Faucet) -> Result<TransactionRequestBuilder> {
    if f.signers.is_empty() {
        return Ok(TransactionRequestBuilder::new());
    }
    let bound = client.get_sync_height().await?;
    let header = client.get_latest_block_header().await?;
    let fee_faucet = client.get_protocol_config(header.protocol_config_commitment()).await?.fee_asset_id().faucet_id();
    // the salt makes the summary unique: the faucet refuses a summary it already ran
    let rng = client.rng();
    let salt = Word::from([Felt::from(rng.next_u32()), Felt::from(rng.next_u32()), Felt::from(rng.next_u32()), Felt::from(rng.next_u32())]);
    let args = MultisigAuthArgs::new(bound, salt)
        .with_approval_expiration_delta(NonZeroU32::new(APPROVAL_BLOCKS).unwrap())?
        .with_conversion_info(FeeConversionInfo::one_to_one(fee_faucet));
    let c = args.to_commitment();
    Ok(TransactionRequestBuilder::new().auth_arg(c).extend_advice_map([(c, args.to_elements())]).block_numbers([bound]))
}

/// Signs a request of the faucet and submits it, or writes the proposal for the other signers.
async fn propose(client: &mut GqClient, keystore: &FilesystemKeyStore, f: &Faucet, what: &str, request: TransactionRequest) -> Result<()> {
    if f.signers.is_empty() {
        // the old single-key faucet: the keystore signs during execution
        println!("{what}: submitting");
        let tx_id = client.submit_new_transaction(f.id()?, request).await?;
        return wait_for_commit(client, tx_id).await;
    }
    let p = Proposal { what: what.to_string(), request: hex(&request.to_bytes()), summary: String::new(), signatures: vec![] };
    advance(client, keystore, f, p).await
}

/// Signs the proposal with every local signer key, then submits it or writes it for the next signer.
async fn advance(client: &mut GqClient, keystore: &FilesystemKeyStore, f: &Faucet, mut p: Proposal) -> Result<()> {
    let id = f.id()?;
    let request = TransactionRequest::read_from_bytes(&unhex(&p.request)?)?;
    // an unsigned run hands back what the signers sign: the summary of this exact transaction
    let summary = match client.execute_transaction(id, request.clone()).await {
        Err(ClientError::TransactionExecutorError(TransactionExecutorError::Unauthorized(s))) => *s,
        Ok(_) => bail!("the faucet ran this without a signature"),
        Err(e) => return Err(e.into()),
    };
    if p.summary.is_empty() {
        p.summary = hex(&summary.to_bytes());
    } else {
        ensure!(p.summary == hex(&summary.to_bytes()), "the proposal no longer matches the transaction it describes; make a new one");
    }
    let msg = summary.to_commitment();
    for pk in f.signer_keys()? {
        let key = Word::from(pk).to_hex();
        if p.signatures.iter().any(|(k, _)| *k == key) {
            continue;
        }
        if let Ok(sig) = keystore.get_signature(pk, &SigningInputs::TransactionSummary(Box::new(summary.clone()))).await {
            p.signatures.push((key, hex(&sig.to_bytes())));
        }
    }
    let have = p.signatures.len();
    if have < f.threshold as usize {
        let path = proposal_file();
        std::fs::write(&path, serde_json::to_string_pretty(&p)? + "\n")?;
        println!("{}: {have} of {} signatures; wrote {}. Another signer runs: gamecoin sign", p.what, f.threshold, path.display());
        return Ok(());
    }
    let mut request = request;
    for (k, s) in &p.signatures {
        let sig = Signature::read_from_bytes(&unhex(s)?)?;
        request.advice_map_mut().insert(Hasher::merge(&[parse_word(k)?, msg]), sig.to_encoded_signature(msg));
    }
    println!("{}: {have} of {} signatures, submitting", p.what, f.threshold);
    let tx_id = client.submit_new_transaction(id, request).await?;
    println!("tx {}", tx_id.to_hex());
    wait_for_commit(client, tx_id).await?;
    let _ = std::fs::remove_file(proposal_file());
    Ok(())
}

/// Waits for the fee note sent to the faucet (the testnet faucet API, or the node after a mainnet registration) and takes it.
async fn take_funding(client: &mut GqClient, keystore: &FilesystemKeyStore, f: &Faucet) -> Result<()> {
    let id = f.id()?;
    let started = Instant::now();
    let note: Note = loop {
        client.sync_state().await?;
        if let Some((record, _)) = client.get_consumable_notes(Some(id)).await?.into_iter().next() {
            break record.try_into()?;
        }
        ensure!(started.elapsed() < NETWORK_TIMEOUT, "no fee note reached the faucet in 10 minutes");
        tokio::time::sleep(POLL_INTERVAL).await;
    };
    let request = base(client, f).await?.build_consume_notes(vec![note])?;
    propose(client, keystore, f, "take the fee note", request).await
}

/// Tops up the fee asset from the testnet faucet when the account has none.
async fn fund_fees(client: &mut GqClient, keystore: &FilesystemKeyStore, f: &Faucet) -> Result<()> {
    let id = f.id()?;
    let header = client.get_latest_block_header().await?;
    let fee_asset = client.get_protocol_config(header.protocol_config_commitment()).await?.fee_asset_id();
    let balance = client.get_account(id).await?.context("account")?.vault().get_balance(fee_asset)?;
    if balance.as_u64() > 0 {
        return Ok(());
    }
    println!("Requesting fee tokens for {} ...", id.to_hex());
    println!("faucet note {}", request_fee_tokens(TESTNET_FAUCET_API, id)?);
    take_funding(client, keystore, f).await
}

async fn fees() -> Result<()> {
    let f = Faucet::load()?;
    let setup = setup_client().await?;
    let mut client = setup.client;
    client.sync_state().await?;
    if mainnet() {
        // no faucet API: report the balance, a wallet tops it up
        let id = f.id()?;
        let header = client.get_latest_block_header().await?;
        let fee_asset = client.get_protocol_config(header.protocol_config_commitment()).await?.fee_asset_id();
        let balance = client.get_account(id).await?.context("account")?.vault().get_balance(fee_asset)?;
        println!("fee asset {}", fee_asset.faucet_id().to_hex());
        println!("{} holds {} base units; send it USDCx to top up", id.to_bech32(network_id()), balance.as_u64());
        return Ok(());
    }
    println!("Requesting fee tokens for {} ...", f.gamecoin);
    println!("faucet note {}", request_fee_tokens(TESTNET_FAUCET_API, f.id()?)?);
    take_funding(&mut client, &setup.keystore, &f).await
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Result<Vec<u8>> {
    (0..s.len()).step_by(2).map(|i| Ok(u8::from_str_radix(s.get(i..i + 2).context("odd hex")?, 16)?)).collect()
}

fn parse_word(s: &str) -> Result<Word> {
    Word::try_from(s).map_err(|e| anyhow::anyhow!("{s}: {e}"))
}

fn parse_account(s: &str) -> Result<AccountId> {
    if s.starts_with("0x") {
        return Ok(AccountId::from_hex(s)?);
    }
    let (_, address) = Address::decode(s).context("bech32 address")?;
    match address.id() {
        miden_protocol::address::AddressId::AccountId(id) => Ok(id),
        other => bail!("unsupported address kind: {other:?}"),
    }
}

fn parse_gc(s: &str) -> Result<u64> {
    let (int, frac) = s.split_once('.').unwrap_or((s, ""));
    if frac.len() > GC_DECIMALS as usize {
        bail!("at most {GC_DECIMALS} decimals");
    }
    let frac = format!("{frac:0<width$}", width = GC_DECIMALS as usize);
    Ok(int.parse::<u64>()? * 10u64.pow(GC_DECIMALS as u32) + frac.parse::<u64>()?)
}
