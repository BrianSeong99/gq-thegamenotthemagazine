//! Client setup, wallet creation and commit polling for the command-line tools. `GQ_NETWORK=mainnet`
//! points them at mainnet (the Cedar hosts), with their own store, keystore and gamecoin file.

use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{bail, ensure, Context, Result};
use miden_client::{
    account::{component::BasicWallet, Account, AccountBuilder, AccountId, AccountType, NetworkId},
    auth::{AuthSecretKey, AuthSingleSig},
    builder::ClientBuilder,
    keystore::{FilesystemKeyStore, Keystore},
    rpc::Endpoint,
    store::TransactionFilter,
    transaction::{TransactionId, TransactionStatus},
    Client, RemoteTransactionProver,
};
use miden_client_sqlite_store::ClientBuilderSqliteExt;
use rand::Rng;

/// Bytes from a hex string without `0x`.
pub fn hex_decode(s: &str) -> Result<Vec<u8>> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2).context("odd hex")?, 16).context("bad hex")).collect()
}

pub const NETWORK_TIMEOUT: Duration = Duration::from_secs(600);
pub const POLL_INTERVAL: Duration = Duration::from_secs(5);

/// A testnet client over `store.sqlite3` and its keystore, both next to the repo root.
pub struct ClientSetup {
    /// The configured Miden client instance.
    pub client: Client<FilesystemKeyStore>,
    /// The filesystem-backed keystore used by the client.
    pub keystore: Arc<FilesystemKeyStore>,
}

/// Opens the testnet client and keystore.
///
/// # Errors
/// Returns an error if RPC connection fails, keystore initialization fails,
/// or client building fails
/// `GQ_NETWORK`: `testnet` (default) or `mainnet`.
pub fn mainnet() -> bool {
    std::env::var("GQ_NETWORK").as_deref() == Ok("mainnet")
}

/// The network's address prefix (mtst / mm).
pub fn network_id() -> NetworkId {
    if mainnet() { NetworkId::Mainnet } else { NetworkId::Testnet }
}

/// A file next to the repo root, with `.mainnet` before its extension on mainnet.
fn root_file(name: &str, ext: &str) -> std::path::PathBuf {
    let tag = if mainnet() { ".mainnet" } else { "" };
    std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/..")).join(format!("{name}{tag}{ext}"))
}

/// Where `gamecoin deploy` writes the faucet id and its signers.
pub fn gamecoin_file() -> std::path::PathBuf {
    root_file("gamecoin", ".json")
}

/// Where `gamecoin` parks a transaction waiting for more signatures.
pub fn proposal_file() -> std::path::PathBuf {
    root_file("proposal", ".json")
}

/// The Gamecoin faucet `gamecoin deploy` wrote to the gamecoin file.
pub fn gamecoin_faucet() -> Result<AccountId> {
    let path = gamecoin_file();
    let state: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&path).with_context(|| path.display().to_string())?)?;
    Ok(AccountId::from_hex(state["gamecoin"].as_str().context("no gamecoin in the gamecoin file, run gamecoin deploy first")?)?)
}

pub async fn setup_client() -> Result<ClientSetup> {
    // `GQ_KEYSTORE`: another keystore, e.g. a second signer's on the same machine
    let keystore_path = std::env::var("GQ_KEYSTORE").map_or_else(|_| root_file("keystore", ""), std::path::PathBuf::from);
    let keystore = Arc::new(FilesystemKeyStore::new(keystore_path).context("Failed to initialize keystore")?);
    let store_path = root_file("store", ".sqlite3");

    let builder = if mainnet() {
        // miden-client 0.17 names mainnet hosts that do not resolve; the live ones are the Cedar hosts
        ClientBuilder::new()
            .grpc_client(&Endpoint::new("https".into(), "rpc.cedar.miden.io".into(), None), None)
            .prover(Arc::new(RemoteTransactionProver::new("https://tx-prover.cedar.miden.io")))
    } else {
        ClientBuilder::for_testnet()
    };
    let client = builder
        .sqlite_store(store_path)
        .authenticator(keystore.clone())
        .build()
        .await
        .context("Failed to build Miden client")?;

    Ok(ClientSetup { client, keystore })
}

/// Creates a basic wallet account (single Falcon signature) and stores its key.
///
/// # Errors
/// Returns an error if account creation, key generation, or keystore operations fail
pub async fn create_basic_wallet_account(
    client: &mut Client<FilesystemKeyStore>,
    keystore: Arc<FilesystemKeyStore>,
    account_type: AccountType,
) -> Result<Account> {
    let mut init_seed = [0_u8; 32];
    client.rng().fill_bytes(&mut init_seed);

    let key_pair = AuthSecretKey::new_falcon512_poseidon2_with_rng(client.rng());

    let builder = AccountBuilder::new(init_seed)
        .account_type(account_type)
        .with_component(AuthSingleSig::from_public_key(key_pair.public_key()))
        .with_component(BasicWallet);

    let account = builder
        .build()
        .context("Failed to build basic wallet account")?;

    client
        .add_account(&account, false)
        .await
        .context("Failed to add account to client")?;

    keystore
        .add_key(&key_pair, account.id())
        .await
        .context("Failed to add key to keystore")?;

    Ok(account)
}

/// Wait until a submitted transaction is committed on chain.
///
/// # Errors
/// Returns an error if syncing fails, the transaction is discarded, or the wait times out.
pub async fn wait_for_commit(
    client: &mut Client<FilesystemKeyStore>,
    tx_id: TransactionId,
) -> Result<()> {
    let started = Instant::now();
    loop {
        client.sync_state().await?;
        let records = client
            .get_transactions(TransactionFilter::Ids(vec![tx_id]))
            .await?;
        if let Some(record) = records.first() {
            match &record.status {
                TransactionStatus::Committed { block_number, .. } => {
                    println!(
                        "Transaction {} committed in block {block_number}",
                        tx_id.to_hex()
                    );
                    return Ok(());
                }
                TransactionStatus::Discarded(cause) => {
                    bail!("Transaction {tx_id} discarded: {cause}")
                }
                TransactionStatus::Pending => {}
            }
        }
        ensure!(
            started.elapsed() < NETWORK_TIMEOUT,
            "Timed out waiting for transaction {tx_id}"
        );
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}
