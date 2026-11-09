use near_sdk::serde_json::json;
use near_workspaces::types::{Gas, NearToken};

async fn init_contract() -> Result<
    (
        near_workspaces::Worker<near_workspaces::network::Sandbox>,
        near_workspaces::Contract,
    ),
    Box<dyn std::error::Error>,
> {
    let wasm = std::fs::read("target/wasm32-unknown-unknown/release/knovara.wasm").expect(
        "knovara.wasm not found; run cargo build --target wasm32-unknown-unknown --release first",
    );

    let worker = near_workspaces::sandbox().await?;
    let contract = worker.dev_deploy(&wasm).await?;

    let outcome = contract
        .call("new")
        .args_json(json!({
            "admin_id": contract.id().to_string()
        }))
        .transact()
        .await?;

    assert!(outcome.is_success());
    Ok((worker, contract))
}

#[tokio::test]
async fn test_exact_50_tgas_proposed_limits() -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let rh = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    println!("\n=== SANDBOX EXACT 50 TGAS VALIDATION (6, 6, 9, 7, 8, 6, 8 Tgas) ===");

    // -------------------------------------------------------------
    // TX 1: Rights Holder storage_deposit (Exact Prepaid Limit: 6 Tgas)
    // -------------------------------------------------------------
    let storage_before_1 = contract.view_account().await?.storage_usage;
    let tx1_outcome = rh
        .call(contract.id(), "storage_deposit")
        .args_json(json!({
            "account_id": rh.id().to_string(),
            "registration_only": false
        }))
        .deposit(NearToken::from_yoctonear(20_000_000_000_000_000_000_000)) // 0.02 NEAR
        .gas(Gas::from_tgas(6))
        .transact()
        .await?;
    assert!(
        tx1_outcome.is_success(),
        "TX 1 must succeed under 6 Tgas limit"
    );
    assert!(
        tx1_outcome.failures().is_empty(),
        "TX 1 must have no failures"
    );
    let storage_after_1 = contract.view_account().await?.storage_usage;
    print_outcome_details(
        "TX 1: storage_deposit (6 Tgas limit)",
        &tx1_outcome,
        6,
        storage_before_1,
        storage_after_1,
    );

    // -------------------------------------------------------------
    // TX 2: Buyer storage_deposit (Exact Prepaid Limit: 6 Tgas)
    // -------------------------------------------------------------
    let storage_before_2 = contract.view_account().await?.storage_usage;
    let tx2_outcome = buyer
        .call(contract.id(), "storage_deposit")
        .args_json(json!({
            "account_id": buyer.id().to_string(),
            "registration_only": false
        }))
        .deposit(NearToken::from_yoctonear(15_000_000_000_000_000_000_000)) // 0.015 NEAR
        .gas(Gas::from_tgas(6))
        .transact()
        .await?;
    assert!(
        tx2_outcome.is_success(),
        "TX 2 must succeed under 6 Tgas limit"
    );
    assert!(
        tx2_outcome.failures().is_empty(),
        "TX 2 must have no failures"
    );
    let storage_after_2 = contract.view_account().await?.storage_usage;
    print_outcome_details(
        "TX 2: storage_deposit (6 Tgas limit)",
        &tx2_outcome,
        6,
        storage_before_2,
        storage_after_2,
    );

    // -------------------------------------------------------------
    // TX 3: Rights Holder register_discovery_and_mint (Exact Prepaid Limit: 9 Tgas)
    // -------------------------------------------------------------
    let discovery_id = "knovara-disc-live-001";
    let token_id = "knovara-pass-live-001";
    let manifest_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    let reference_hash = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
    let reference_url = "https://api.knovara.test/api/v1/metadata/knovara-disc-live-001/1.0.0";

    let tx3_payload = json!({
        "discovery_id": discovery_id,
        "token_id": token_id,
        "custodian_id": rh.id().to_string(),
        "rights_controller_id": rh.id().to_string(),
        "evidence_manifest_hash": manifest_hash,
        "metadata": {
            "title": "KNOVARA Real Two-Wallet Discovery",
            "description": "Validated testnet research discovery dataset",
            "media": null,
            "media_hash": null,
            "copies": 1,
            "issued_at": null,
            "expires_at": null,
            "starts_at": null,
            "updated_at": null,
            "extra": "GENERAL",
            "reference": reference_url,
            "reference_hash": reference_hash
        },
        "beneficiary_splits": [
            { "account_id": rh.id().to_string(), "basis_points": 10000 }
        ],
        "lineage_parents": []
    });

    let storage_before_3 = contract.view_account().await?.storage_usage;
    let tx3_outcome = rh
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(tx3_payload)
        .deposit(NearToken::from_near(0))
        .gas(Gas::from_tgas(9))
        .transact()
        .await?;
    assert!(
        tx3_outcome.is_success(),
        "TX 3 must succeed under 9 Tgas limit"
    );
    assert!(
        tx3_outcome.failures().is_empty(),
        "TX 3 must have no failures"
    );
    let storage_after_3 = contract.view_account().await?.storage_usage;
    print_outcome_details(
        "TX 3: register_discovery_and_mint (9 Tgas limit)",
        &tx3_outcome,
        9,
        storage_before_3,
        storage_after_3,
    );

    // -------------------------------------------------------------
    // TX 4: Rights Holder create_license_offer (Exact Prepaid Limit: 7 Tgas)
    // -------------------------------------------------------------
    let offer_id = "knovara-offer-live-001";
    let terms_hash = "f4b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b866";
    let price_yocto = "50000000000000000000000"; // 0.05 NEAR

    let tx4_payload = json!({
        "offer_id": offer_id,
        "discovery_id": discovery_id,
        "scope": "AcademicResearch",
        "price_yocto": price_yocto,
        "terms_hash": terms_hash,
        "duration_days": 30
    });

    let storage_before_4 = contract.view_account().await?.storage_usage;
    let tx4_outcome = rh
        .call(contract.id(), "create_license_offer")
        .args_json(tx4_payload)
        .deposit(NearToken::from_near(0))
        .gas(Gas::from_tgas(7))
        .transact()
        .await?;
    assert!(
        tx4_outcome.is_success(),
        "TX 4 must succeed under 7 Tgas limit"
    );
    assert!(
        tx4_outcome.failures().is_empty(),
        "TX 4 must have no failures"
    );
    let storage_after_4 = contract.view_account().await?.storage_usage;
    print_outcome_details(
        "TX 4: create_license_offer (7 Tgas limit)",
        &tx4_outcome,
        7,
        storage_before_4,
        storage_after_4,
    );

    // -------------------------------------------------------------
    // TX 5: Buyer request_license (Exact Prepaid Limit: 8 Tgas)
    // -------------------------------------------------------------
    let request_id = "knovara-req-live-001";
    let tx5_payload = json!({
        "request_id": request_id,
        "offer_id": offer_id,
        "accepted_terms_hash": terms_hash
    });

    let storage_before_5 = contract.view_account().await?.storage_usage;
    let tx5_outcome = buyer
        .call(contract.id(), "request_license")
        .args_json(tx5_payload)
        .deposit(NearToken::from_near(0))
        .gas(Gas::from_tgas(8))
        .transact()
        .await?;
    assert!(
        tx5_outcome.is_success(),
        "TX 5 must succeed under 8 Tgas limit"
    );
    assert!(
        tx5_outcome.failures().is_empty(),
        "TX 5 must have no failures"
    );
    let storage_after_5 = contract.view_account().await?.storage_usage;
    print_outcome_details(
        "TX 5: request_license (8 Tgas limit)",
        &tx5_outcome,
        8,
        storage_before_5,
        storage_after_5,
    );

    // -------------------------------------------------------------
    // TX 6: Rights Holder approve_license_request (Exact Prepaid Limit: 6 Tgas)
    // -------------------------------------------------------------
    let tx6_payload = json!({
        "request_id": request_id
    });

    let storage_before_6 = contract.view_account().await?.storage_usage;
    let tx6_outcome = rh
        .call(contract.id(), "approve_license_request")
        .args_json(tx6_payload)
        .deposit(NearToken::from_near(0))
        .gas(Gas::from_tgas(6))
        .transact()
        .await?;
    assert!(
        tx6_outcome.is_success(),
        "TX 6 must succeed under 6 Tgas limit"
    );
    assert!(
        tx6_outcome.failures().is_empty(),
        "TX 6 must have no failures"
    );
    let storage_after_6 = contract.view_account().await?.storage_usage;
    print_outcome_details(
        "TX 6: approve_license_request (6 Tgas limit)",
        &tx6_outcome,
        6,
        storage_before_6,
        storage_after_6,
    );

    // -------------------------------------------------------------
    // TX 7: Buyer pay_license (Exact Prepaid Limit: 8 Tgas)
    // -------------------------------------------------------------
    let tx7_payload = json!({
        "request_id": request_id,
        "accepted_terms_hash": terms_hash
    });

    let storage_before_7 = contract.view_account().await?.storage_usage;
    let tx7_outcome = buyer
        .call(contract.id(), "pay_license")
        .args_json(tx7_payload)
        .deposit(NearToken::from_yoctonear(50_000_000_000_000_000_000_000)) // 0.05 NEAR
        .gas(Gas::from_tgas(8))
        .transact()
        .await?;
    assert!(
        tx7_outcome.is_success(),
        "TX 7 must succeed under 8 Tgas limit"
    );
    assert!(
        tx7_outcome.failures().is_empty(),
        "TX 7 must have no failures"
    );
    let storage_after_7 = contract.view_account().await?.storage_usage;
    print_outcome_details(
        "TX 7: pay_license (8 Tgas limit)",
        &tx7_outcome,
        8,
        storage_before_7,
        storage_after_7,
    );

    println!("=== ALL 7 EXACT 50 TGAS TRANSACTIONS SUCCEEDED WITHOUT ERROR ===\n");
    Ok(())
}

fn print_outcome_details(
    label: &str,
    outcome: &near_workspaces::result::ExecutionFinalResult,
    attached_tgas: u64,
    storage_before: u64,
    storage_after: u64,
) {
    let total_gas = outcome.total_gas_burnt.as_gas();
    let tx_outcome = outcome.outcome();
    let tx_gas = tx_outcome.gas_burnt.as_gas();
    let tx_tokens = tx_outcome.tokens_burnt.as_yoctonear();

    let mut receipts_gas = 0u64;
    let mut receipts_tokens = 0u128;
    for (i, r) in outcome.receipt_outcomes().iter().enumerate() {
        let r_gas = r.gas_burnt.as_gas();
        let r_tokens = r.tokens_burnt.as_yoctonear();
        receipts_gas += r_gas;
        receipts_tokens += r_tokens;
        println!(
            "  [{label}] Receipt {i}: gas_burnt = {} ({:.4} Tgas), tokens_burnt = {} yocto ({:.6} NEAR)",
            r_gas,
            (r_gas as f64) / 1e12,
            r_tokens,
            (r_tokens as f64) / 1e24
        );
    }

    assert!(outcome.failures().is_empty(), "No receipt failures allowed");

    let margin_pct = ((attached_tgas as f64 * 1e12 - receipts_gas as f64)
        / (attached_tgas as f64 * 1e12))
        * 100.0;
    let storage_diff = storage_after as i64 - storage_before as i64;

    println!(
        "[{label}]\n  Attached FunctionCall Gas: {} Tgas\n  Tx Conversion Gas: {} ({:.4} Tgas), tokens: {} yocto ({:.6} NEAR)\n  Receipts Burnt Gas: {} ({:.4} Tgas), tokens: {} yocto ({:.6} NEAR)\n  TOTAL GAS BURNT: {} ({:.4} Tgas), TOTAL TOKENS: {} yocto ({:.6} NEAR)\n  Unused Headroom: {:.2}% ({:.4} Tgas remaining)\n  Storage: before = {} B, after = {} B, diff = {:+} B\n  Status: SUCCESS (Zero Failures)\n",
        attached_tgas,
        tx_gas,
        (tx_gas as f64) / 1e12,
        tx_tokens,
        (tx_tokens as f64) / 1e24,
        receipts_gas,
        (receipts_gas as f64) / 1e12,
        receipts_tokens,
        (receipts_tokens as f64) / 1e24,
        total_gas,
        (total_gas as f64) / 1e12,
        tx_tokens + receipts_tokens,
        ((tx_tokens + receipts_tokens) as f64) / 1e24,
        margin_pct,
        (attached_tgas as f64) - (receipts_gas as f64 / 1e12),
        storage_before,
        storage_after,
        storage_diff
    );
}
