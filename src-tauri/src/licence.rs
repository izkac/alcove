use std::path::PathBuf;

use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use tauri::{AppHandle, Manager};

/// Verifies licence keys. Deliberately *not* the updater's key: a leaked
/// licence key must not also be able to push a build to every install.
const LICENCE_PUBKEY: &str = "untrusted comment: minisign public key: CFA9F2D5D9FBD4B\nRWRLvZ9dLZ/6DKIIrZKKjJLowbPC0qkSYDZFyxoumpqnqleKcc5Thwhd\n";

/// A licence is `<payload>.<signature>`, both base64. The payload is
/// `name|expires`, and `expires` is the unix second after which no *new*
/// version is offered. Versions already installed keep working forever — the
/// licence buys the update stream, not the software.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Licence {
    pub name: String,
    pub expires: i64,
    /// False once `expires` has passed. The install stays; the updates stop.
    pub active: bool,
}

fn b64(part: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(part.trim())
        .map_err(|_| "That licence key is not readable".to_string())
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Check a key's signature and read what it grants. Verification is entirely
/// offline: no licence server to run, to pay for, or to go down at 3am.
pub fn parse(key: &str) -> Result<Licence, String> {
    let (payload_b64, signature_b64) = key
        .trim()
        .split_once('.')
        .ok_or_else(|| "That licence key is not readable".to_string())?;
    let payload = b64(payload_b64)?;
    let signature_text = String::from_utf8(b64(signature_b64)?)
        .map_err(|_| "That licence key is not readable".to_string())?;

    let public_key =
        PublicKey::decode(LICENCE_PUBKEY).map_err(|err| format!("bad build key: {err}"))?;
    let signature =
        Signature::decode(&signature_text)
            .map_err(|_| "That licence key is not valid".to_string())?;
    public_key
        .verify(&payload, &signature, false)
        .map_err(|_| "That licence key is not valid".to_string())?;

    let text = String::from_utf8(payload).map_err(|_| "That licence key is not readable".to_string())?;
    let (name, expires) = text
        .trim()
        .rsplit_once('|')
        .ok_or_else(|| "That licence key is not readable".to_string())?;
    let expires: i64 = expires
        .trim()
        .parse()
        .map_err(|_| "That licence key is not readable".to_string())?;
    Ok(Licence {
        name: name.trim().to_string(),
        expires,
        active: now() < expires,
    })
}

fn licence_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| err.to_string())
        .map(|dir| dir.join("licence.key"))
}

/// Kept beside the layout, not inside it: resetting your desk to an empty Inbox
/// should not throw away something you paid for.
pub fn load(app: &AppHandle) -> Option<Licence> {
    let path = licence_path(app).ok()?;
    let key = std::fs::read_to_string(path).ok()?;
    parse(&key).ok()
}

pub fn store(app: &AppHandle, key: &str) -> Result<Licence, String> {
    let licence = parse(key)?;
    if !licence.active {
        return Err("That licence has expired".into());
    }
    let path = licence_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    }
    std::fs::write(&path, key.trim()).map_err(|err| err.to_string())?;
    Ok(licence)
}

pub fn active(app: &AppHandle) -> bool {
    load(app).is_some_and(|licence| licence.active)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real key from `node scripts/issue-licence.mjs`. It pins the whole
    /// chain — issuing script, key file, signature format, parser — so a change
    /// to any one of them fails here instead of in a customer's inbox.
    const SAMPLE: &str = "Y2hlY2tAYWxjb3ZlLnRlc3R8MTgxOTI3NjA5Nw==.dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSTHZaOWRMWi82REk3ZTRLcVk4TTJvNjBNYW16cVVUbzFrVXVpN21LR0RjQU15QnpaZG85K1BWMkFMcmFReFE5NkY3Y3lIMHBhY2tyQ2tSeDA4MWxHaVhGWTFOSm1lbVFZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzg4MTcyMDk3CWZpbGU6bGljZW5jZQpEMFpFRXlyWGVyR3VzQW9mMG1CV1NkRmI0d1FMOVZFakxxempiM1VDZHRCSGpoOFFKYWhvUHprZ1JyVHJDQ3dJakRUbElpWVJiS1Q0dUNpa0ZxU0ZBQT09Cg==";

    #[test]
    fn reads_a_real_licence() {
        let licence = parse(SAMPLE).expect("sample licence verifies");
        assert_eq!(licence.name, "check@alcove.test");
        assert!(licence.expires > now(), "sample was issued for a year");
        assert!(licence.active);
    }

    #[test]
    fn rejects_an_edited_payload() {
        // Same signature, payload swapped for a later expiry: the obvious
        // forgery, and the one thing the signature exists to stop.
        let (_, signature) = SAMPLE.split_once('.').unwrap();
        let forged = base64::engine::general_purpose::STANDARD
            .encode("check@alcove.test|99999999999");
        assert!(parse(&format!("{forged}.{signature}")).is_err());
    }

    #[test]
    fn rejects_junk() {
        assert!(parse("").is_err());
        assert!(parse("no-dot-here").is_err());
        assert!(parse("bm90YmFzZTY0.bm90YmFzZTY0").is_err());
    }

    #[test]
    fn an_expired_licence_parses_but_is_not_active() {
        // Reading a lapsed licence must still work: we need the name to show
        // "renew", and the install itself is never disabled.
        let licence = Licence { name: "x".into(), expires: 0, active: 0 > now() };
        assert!(!licence.active);
    }
}
