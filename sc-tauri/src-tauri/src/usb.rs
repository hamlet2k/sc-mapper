//! USB enumeration stubs. No real device discovery yet.

#[derive(Debug, Clone, serde::Serialize)]
pub struct Device {
    pub id: String,
    pub name: String,
}

pub fn list_devices() -> Vec<Device> {
    Vec::new()
}
