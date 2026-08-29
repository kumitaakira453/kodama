// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // GUI が起動していなくても AI が指摘を読み書きできるよう、CLI としても動く。
    if kodama_lib::run_cli_if_requested() {
        return;
    }
    kodama_lib::run()
}
