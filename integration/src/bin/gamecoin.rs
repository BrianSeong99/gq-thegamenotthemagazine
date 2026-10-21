//! Gamecoin (GC): a public fungible faucet whose key lives in the keystore next to the repo root.
//! Players buy Gamecoin in the app (sale notes, web/src/lib/shop.ts); this tool deploys the faucet
//! and mints from the command line.
//!
//!   cargo run --release --bin gamecoin deploy <account> <GC>     # once; mints the first GC to <account>, writes the gamecoin file
//!   cargo run --release --bin gamecoin mint <account> <GC>
//!   cargo run --release --bin gamecoin fees                      # top up the faucet's fee balance (testnet faucet API)
//!
//! `<account>` is bech32 or hex. `GQ_NETWORK=mainnet` uses the mainnet store, keystore and
//! gamecoin file; there `deploy` registers the faucet with the invite code in `GQ_INVITE_CODE`,
//! which also funds its fees (the node pays a registered account). The faucet pays the fees of
//! every mint in the chain's fee asset.

use anyhow::{bail, Context, Result};
use integration::{
    faucet_api::{request_fee_tokens, TESTNET_FAUCET_API},
    funding::ensure_accounts_funded,
    helpers::{gamecoin_faucet, gamecoin_file, mainnet, network_id, setup_client, wait_for_commit},
};
use miden_client::{
    account::{
        standards::{
            access::{Authority, Pausable},
            faucets::{FungibleFaucet, TokenName},
            policies::{BurnPolicy, MintPolicy, TokenPolicyManager},
            wallets::BasicWallet,
        },
        Account, AccountBuilder, AccountId, AccountType, Address,
    },
    asset::{AssetAmount, FungibleAsset, TokenSymbol},
    auth::{AuthSecretKey, AuthSingleSig},
    keystore::Keystore,
    note::NoteType,
    transaction::TransactionRequestBuilder,
};
use rand::Rng;

const GC_DECIMALS: u8 = 6;
const GC_MAX_SUPPLY: u64 = 100_000_000_000 * 1_000_000; // 100 billion GC

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("deploy") if args.len() == 3 => deploy(&args[1], &args[2]).await,
        Some("mint") if args.len() == 3 => mint(&args[1], &args[2]).await,
        Some("fees") => fees().await,
        _ => bail!("usage: gamecoin deploy <account> <GC> | gamecoin mint <account> <GC> | gamecoin fees"),
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

    let mut seed = [0u8; 32];
    client.rng().fill_bytes(&mut seed);
    let key = AuthSecretKey::new_falcon512_poseidon2_with_rng(client.rng());
    let account: Account = AccountBuilder::new(seed)
        .account_type(AccountType::Public)
        .with_component(AuthSingleSig::from_public_key(key.public_key()))
        .with_component(faucet)
        // the faucet pays its own fees, received as plain P2ID notes
        .with_component(BasicWallet)
        .with_component(Authority::AuthControlled)
        .with_components(policies)
        // the faucet's mint checks the pause flag; without a manager nobody can flip it
        .with_component(Pausable::unpaused())
        .build()
        .context("build faucet account")?;
    client.add_account(&account, false).await?;
    setup.keystore.add_key(&key, account.id()).await.context("keystore")?;

    let id = account.id();
    println!("Gamecoin faucet: {} ({})", id.to_bech32(network_id()), id.to_hex());
    let file = gamecoin_file();
    std::fs::write(&file, format!("{{\n  \"gamecoin\": \"{}\"\n}}\n", id.to_hex()))?;
    println!("wrote {}; set VITE_GC_FAUCET or web/src/config.ts GC_FAUCET to it", file.display());

    if let Some(code) = code {
        // one code per account; the node answers once its funding note is committed
        println!("Registering the faucet on mainnet ...");
        client.register_account(id, &code).await.context("register_account")?;
        ensure_accounts_funded(&mut client, &[id]).await?;
    } else {
        fund_fees(&mut client, id).await?;
    }
    println!("Faucet is funded for fees.");
    mint_to(&mut client, id, owner, first).await?;
    println!("Minted {first_gc} GC to {}. Mint more with: gamecoin mint <account> <GC>", owner.to_hex());
    Ok(())
}

async fn mint(target: &str, amount_gc: &str) -> Result<()> {
    let faucet_id = gamecoin_faucet()?;
    let target_id = parse_account(target)?;
    let amount = parse_gc(amount_gc)?;

    let setup = setup_client().await?;
    let mut client = setup.client;
    client.sync_state().await?;
    if !mainnet() {
        fund_fees(&mut client, faucet_id).await?;
    }
    mint_to(&mut client, faucet_id, target_id, amount).await?;
    println!("Minted {amount_gc} GC to {}", target_id.to_hex());
    Ok(())
}

async fn mint_to(client: &mut miden_client::Client<miden_client::keystore::FilesystemKeyStore>, faucet_id: AccountId, target_id: AccountId, amount: u64) -> Result<()> {
    let asset = FungibleAsset::new(faucet_id, amount)?;
    let request = TransactionRequestBuilder::new()
        .build_mint_fungible_asset(asset, target_id, NoteType::Public, client.rng())?;
    let tx_id = client.submit_new_transaction(faucet_id, request).await?;
    println!("mint tx {}", tx_id.to_hex());
    wait_for_commit(client, tx_id).await
}

async fn fees() -> Result<()> {
    let faucet_id = gamecoin_faucet()?;
    if mainnet() {
        bail!("mainnet has no faucet API: send USDCx to {} from a wallet", faucet_id.to_bech32(network_id()));
    }
    let setup = setup_client().await?;
    let mut client = setup.client;
    client.sync_state().await?;
    println!("Requesting fee tokens for {} ...", faucet_id.to_hex());
    let note = request_fee_tokens(TESTNET_FAUCET_API, faucet_id)?;
    println!("faucet note {note}");
    ensure_accounts_funded(&mut client, &[faucet_id]).await
}

/// Tops up the fee asset from the testnet faucet when the account has none.
async fn fund_fees(client: &mut miden_client::Client<miden_client::keystore::FilesystemKeyStore>, id: AccountId) -> Result<()> {
    let header = client.get_latest_block_header().await?;
    let fee_asset = client.get_protocol_config(header.protocol_config_commitment()).await?.fee_asset_id();
    let balance = client.get_account(id).await?.context("account")?.vault().get_balance(fee_asset)?;
    if balance.as_u64() > 0 {
        return Ok(());
    }
    println!("Requesting fee tokens for {} ...", id.to_hex());
    let note = request_fee_tokens(TESTNET_FAUCET_API, id)?;
    println!("faucet note {note}");
    ensure_accounts_funded(client, &[id]).await
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
