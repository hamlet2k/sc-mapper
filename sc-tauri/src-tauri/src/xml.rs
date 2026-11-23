//! XML read/write stubs. No real actionmaps I/O yet.

pub fn read_actionmaps(_path: &str) -> Result<String, String> {
    Ok(String::new())
}

pub fn write_actionmaps(_path: &str, _contents: &str) -> Result<(), String> {
    Ok(())
}
