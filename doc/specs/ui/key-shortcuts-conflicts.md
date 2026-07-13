# Reserved OS Keyboard Shortcuts & TUI Conflicts
Do not change this file, this file is about gathered knowledge. You should avoid key shortcut conflicts mentioned by this file.

Reference catalog of keyboard shortcuts that are reserved, expected, or otherwise claimed by macOS, Linux (TTY + readline), and Windows (Console + Win32 hotkeys). Companion to `tui-shortcuts.md`; lists which of those bindings collide with our TUI's chosen keymap and how `jie` avoids or honors each conflict.

The TUI runs inside a terminal that itself runs on top of an OS process. Three layers compete for the same keys:

- **OS shell** (Apple HIG, Windows shell, GNOME/KDE shortcuts) — claimed system-wide.
- **TTY driver / conhost** (termios `c_cc` on Linux/macOS, `ENABLE_PROCESSED_INPUT` on Windows) — claimed even before the application sees the key.
- **Application** (the TUI's own handler, plus any readline/edit bindings inside the editor) — claimed by us.

A shortcut is "reserved" if any of those layers will intercept it before the TUI's handler can act. The catalog below splits each platform into "Reserved by the system/TTY" (we must not claim) and "Expected / standard app shortcuts" (users will assume them; we may want to mirror some).

## macOS

Sources: Apple HIG `OS X Human Interface Guidelines — Keyboard Shortcuts`; `Accessibility Programming Guide for OS X — Keyboard Shortcuts`; `com.apple.symbolichotkeys.plist` defaults; macOS StandardKeyBinding.dict. The tables below list only entries relevant to keys the TUI might consider.

### System-reserved (do not override)

These shortcuts are claimed by macOS regardless of which app has focus. macOS does not route them to user apps.

| Shortcut | Action |
| --- | --- |
| `Cmd+Space` | Show/hide Spotlight search field (or rotate script systems if multiple) |
| `Shift+Cmd+Space` | Apple reserved |
| `Opt+Cmd+Space` | Show Spotlight results window / rotate input methods |
| `Ctrl+Cmd+Space` | Show Special Characters window |
| `Ctrl+Tab` | Move focus to next group of controls |
| `Shift+Ctrl+Tab` | Move focus to previous group of controls |
| `Cmd+Tab` | Move forward through recently used apps |
| `Shift+Cmd+Tab` | Move backward through recently used apps |
| `Opt+Cmd+Esc` | Open Force Quit dialog |
| `Ctrl+Cmd+Eject` | Quit all apps and restart |
| `Ctrl+Opt+Cmd+Eject` | Quit all apps and shut down |
| `Ctrl+F1` | Toggle full keyboard access |
| `Ctrl+F2` | Move focus to menu bar |
| `Ctrl+F3` | Move focus to Dock |
| `Ctrl+F4` | Move focus to active/next window |
| `Shift+Ctrl+F4` | Move focus to previously active window |
| `Ctrl+F5` | Move focus to toolbar |
| `Cmd+F5` | Turn VoiceOver on/off |
| `Ctrl+F6` / `Shift+Ctrl+F6` | Move focus to next/previous panel |
| `Ctrl+F7` | Temporarily override keyboard access mode |
| `F8` / `F9` / `F10` | Apple reserved (Spaces, expose; varies by macOS version) |
| `F11` | Show desktop |
| `F12` | Show Dashboard / show notification center |
| `Cmd+'` / `Shift+Cmd+'` / `Opt+Cmd+'` | Activate next/previous window in app / focus drawer |
| `Cmd+-` / `Shift+Cmd+-` | Decrease / increase selection size |
| `Opt+Cmd+-` / `Opt+Cmd+=` | Zoom out / zoom in |
| `Ctrl+Opt+Cmd+,` / `Ctrl+Opt+Cmd+.` | Decrease / increase contrast |
| `Cmd+?` / `Opt+Cmd+/` | Open app Help / toggle font smoothing |
| `Shift+Cmd+3` / `Ctrl+Shift+Cmd+3` | Capture screen to file / to clipboard |
| `Shift+Cmd+4` / `Ctrl+Shift+Cmd+4` | Capture selection to file / to clipboard |
| `Opt+Cmd+8` / `Ctrl+Opt+Cmd+8` | Toggle screen zoom / invert screen colors |
| `Opt+Cmd+D` | Toggle Dock hiding |
| `Shift+Cmd+Q` / `Opt+Shift+Cmd+Q` | Log out current user (with/without confirmation) |
| `Cmd+Right Arrow` | Change to next Roman-script keyboard layout |
| `Cmd+Left Arrow` | Change to system-script keyboard layout |
| `Cmd+Esc` | Front Row hide/show |

### Apple-reserved menu actions (expected everywhere — see `HIG` Table 4-1)

macOS apps follow these de facto; users assume them across every app.

| Shortcut | Action |
| --- | --- |
| `Cmd+N` | New document/window |
| `Cmd+O` | Open... |
| `Cmd+W` | Close window |
| `Cmd+S` | Save |
| `Cmd+Shift+S` | Save As... |
| `Cmd+P` | Print |
| `Cmd+Q` | Quit app |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo / Redo |
| `Cmd+X` / `Cmd+C` / `Cmd+V` | Cut / Copy / Paste |
| `Cmd+A` | Select All |
| `Cmd+F` / `Cmd+G` / `Cmd+Shift+G` | Find / Find Next / Find Previous |
| `Cmd+H` | Hide active app |
| `Cmd+M` / `Cmd+Opt+M` | Minimize window / Minimize all of app |
| `Cmd+,` | Preferences |

## Linux / POSIX terminals

Two layers: the kernel TTY driver (termios `c_cc` specials, active in cooked/canonical mode) and the application (readline/libedit when the editor is on stdin, or the TUI directly when in raw mode).

### Kernel TTY specials (active in cooked mode)

The TTY driver claims these even before the application sees them. In raw mode they pass through as plain bytes; in cooked mode they are interpreted as the listed action.

| Key | `stty` name | Default action |
| --- | --- | --- |
| `Ctrl+C` | `intr` | Send `SIGINT` to foreground process group |
| `Ctrl+\` | `quit` | Send `SIGQUIT` |
| `Ctrl+Z` | `susp` | Send `SIGTSTP` (suspend) |
| `Ctrl+D` | `eof` | Flush line; on empty line → EOF (logs out the shell) |
| `Ctrl+S` / `Ctrl+Q` | `stop` / `start` | XOFF / XON (IXON flow control; suspend/resume output) |
| `Ctrl+U` | `kill` | Discard current line |
| `Ctrl+W` | `werase` | Erase previous word |
| `Ctrl+H` / `Backspace` | `erase` | Erase previous character |
| `Ctrl+R` | `rprnt` | Reprint pending input (after flow control pause) |
| `Ctrl+V` | `lnext` | Literal-next: take the next char as a literal byte |
| `Ctrl+O` | `discard` | Toggle discarding of pending output |
| `Ctrl+Y` | `dsusp` (BSD) | Delayed suspend |

A raw-mode TUI gets all of these as plain bytes (`0x03`, `0x1c`, `0x1a`, `0x04`, ...) and is free to bind them.

### readline / Emacs mode (claimed by the editing library)

When the editor is a readline app (anything typed into bash, python REPL, psql, etc.) readline installs these bindings by default. TUI prompts that are NOT raw (e.g. an external `readline`-driven editor field) will receive these.

| Key | Action |
| --- | --- |
| `Ctrl+A` | Beginning of line |
| `Ctrl+E` | End of line |
| `Ctrl+B` / `Ctrl+F` | Backward / forward char |
| `Alt+B` / `Alt+F` | Backward / forward word |
| `Ctrl+K` | Kill to end of line |
| `Ctrl+U` | Kill to beginning of line |
| `Ctrl+W` | Kill previous word |
| `Ctrl+Y` | Yank (paste from kill ring) |
| `Ctrl+D` | Delete char at cursor (or EOF when line is empty) |
| `Ctrl+H` / `Backspace` | Delete previous char |
| `Ctrl+T` | Transpose chars |
| `Ctrl+L` | Clear screen |
| `Ctrl+R` / `Ctrl+S` | Reverse / forward incremental history search |
| `Ctrl+N` / `Ctrl+P` | Next / previous history |
| `Ctrl+Q` / `Ctrl+V` | Quoted-insert (literal next char) |
| `Ctrl+G` | Abort |
| `Ctrl+[` (`ESC`) | Meta prefix on keyboards without Alt |
| `Ctrl+_` | Undo |
| `Ctrl+X Ctrl+R` | Re-read init file |
| `Ctrl+X Ctrl+U` | Undo |

### Terminal emulator / desktop hotkeys (often system-wide)

Modern terminal emulators and desktop environments also bind:

| Shortcut | Action (depends on emulator / DE) |
| --- | --- |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copy / paste (some emulators; GNOME Terminal pre-2017 used `Ctrl+C`/`Ctrl+V` for copy) |
| `Ctrl+Insert` / `Shift+Insert` | Copy / paste (xterm default) |
| `Shift+PgUp` / `Shift+PgDn` | Scroll back / forward (terminal emulator; not the application) |
| `Ctrl+Shift+Up` / `Ctrl+Shift+Down` | Scroll back / forward (newer consoles; macOS Terminal, Windows Terminal) |
| `Ctrl+Plus` / `Ctrl+Minus` / `Ctrl+0` | Zoom in / out / reset (terminal emulator font scale) |
| `Super+Space` (GNOME) / `Ctrl+Alt+Space` (KDE) | Activity overview / window operations |
| `Ctrl+Alt+T` (GNOME) / Super+K (KDE) | Open a terminal |

These never reach the foreground TUI; they are intercepted by the terminal emulator or the window manager.

## Windows

Two layers: `RegisterHotKey` / Win32 app hotkeys (system-wide hotkeys) and the legacy console host's menu / line-edit shortcuts inside `conhost.exe`. Modern terminals (Windows Terminal, WezTerm, etc.) sit on top of `conhost` and inherit the same conflicts.

### System-wide hotkeys (`RegisterHotKey`)

These are claimed by Windows before any app sees them. The Win32 docs explicitly state "keyboard shortcuts that involve the WINDOWS key are reserved for use by the operating system" and "the F12 key is reserved for use by the debugger".

| Shortcut | Action |
| --- | --- |
| `Ctrl+Esc` | Open Start menu |
| `Win` (alone) | Open Start menu |
| `Win+L` | Lock workstation |
| `Win+R` | Open Run dialog |
| `Win+E` | Open Explorer |
| `Win+D` | Show desktop |
| `Win+M` | Minimize all windows |
| `Win+Home` | Minimize/restore background windows |
| `Win+T` / `Win+B` | Cycle taskbar / focus notification area |
| `Win+P` | Presentation mode cycle |
| `Win+I` / `Win+K` | Open Settings / Connect charm |
| `Win+Q` / `Win+W` / `Win+H` | Open Search / Ink workspace / Dictation |
| `Win+V` / `Win+Z` | Clipboard history / app bar |
| `Win+Space` | Switch input language/keyboard |
| `Win+Up/Down/Left/Right` | Maximize / minimize / snap window |
| `Win+Shift+Up/Down/Left/Right` | Stretch / move window to monitor |
| `Win+Plus` / `Win+Minus` | Zoom in / out (Magnifier) |
| `Win+Esc` | Close Magnifier |
| `Win+Tab` | Task view (also `Win+Ctrl+Tab`, `Win+Shift+Tab`) |
| `Alt+Tab` / `Alt+Shift+Tab` | Switch task |
| `Ctrl+Alt+Tab` | Switch window (focus-receiver variant) |
| `Ctrl+Tab` | Switch window (when inside one) |
| `Alt+Space` | Window menu (restore / move / size / minimize / maximize / close) |
| `Alt+F4` | Close window |
| `Alt+Enter` | Properties dialog (for selected file in Explorer) |
| `F1` | Help |
| `F12` | Reserved for the debugger |

### Console host shortcuts (`conhost.exe`)

Inside any console window — `cmd.exe`, PowerShell, Windows Terminal in process mode — these are bound by the console line discipline regardless of what the application does with raw input. The new console (Windows 10+) reads them with `ENABLE_PROCESSED_INPUT`, but cmd/PowerShell enforce them even in VT input mode, which is documented behavior of the shell.

| Shortcut | Action |
| --- | --- |
| `Ctrl+C` | SIGINT to the console process (when no selection; with selection → Copy) |
| `Ctrl+Break` | `SIGBREAK` |
| `Ctrl+V` | Paste (also blocks literal next char) |
| `Ctrl+Insert` / `Shift+Insert` | Copy / paste |
| `Ctrl+M` | Enter Mark mode (block selection) |
| `Ctrl+Home` / `Ctrl+End` | Move to beginning / end of screen buffer |
| `Ctrl+Shift+Home` / `Ctrl+Shift+End` | Select to beginning / end of buffer |
| `Ctrl+Left` / `Ctrl+Right` | Jump one word left / right |
| `Ctrl+Shift+Left` / `Ctrl+Shift+Right` | Extend selection one word |
| `Tab` / `Shift+Tab` | Autocomplete file/folder name (when on the prompt) |
| `Up` / `Down` | Walk command history (cmd / PowerShell) |
| `F7` / `Alt+F7` | Show command history dialog / clear it |
| `F8` | Search backwards in command history matching current prefix |
| `F9` | Run command by history number |
| `Alt+Enter` | Toggle full-screen window (legacy conhost only) |

When the underlying shell launches a TUI process and the TUI takes over the console with raw input, these become plain bytes — but a user typing them has been trained by the shell for years, so they remain de facto reserved. We document them as expected behavior the TUI is free to re-bind.

## Conflicts with the TUI's keymap

The TUI keys come from `tui-shortcuts.md`. The table below cross-references each binding to every platform claim, and records the resolution.

| TUI key | macOS conflict | Linux conflict | Windows conflict | Resolution |
| --- | --- | --- | --- | --- |
| `Enter` | none | `Ctrl+M` (0x0D) is identical to Enter in cooked mode | none | Honored. Submit prompt. |
| `Up` / `Down` | none — system bindings require modifier | Readline/Cmd history walks; in raw mode TUI owns them | cmd/PowerShell history walks; in raw mode TUI owns them | Honored. Editor walks prompt history. |
| `Esc Esc` | none | none | none | Honored. Interrupt current agent. |
| `Ctrl+Left` | `Cmd+Left` is "switch to previous keyboard layout" (Cmd-shift) and `Opt+Shift+Cmd+Left` is window movement; `Ctrl+Left` is free on macOS | Readline: not bound by default. Some DE/window-manager bindings (`Super+Left` snaps on GNOME, but `Ctrl+Left` is free) | Console host: "jump one word left" — only inside shell input, not a system-wide hotkey | Honored. Toggle the left rail. Safe on macOS and Linux; on Windows inside cmd the user would have to be in a raw-mode TUI already, where the console host shortcuts are inactive. |
| `Ctrl+T` | None at modifier level. `Cmd+T` is "new tab" — irrelevant for a TUI tab model. `Cmd+Opt+T` / `Shift+Cmd+T` are also macOS-reserved for various system windows; `Ctrl+T` is free | `Ctrl+T` is readline "transpose-chars" inside a readline prompt, not in raw mode. SIGSTOP (`Ctrl+Z`) is the danger, not `Ctrl+T` | Console host: `Ctrl+T` is not reserved (it's free for cmd/PowerShell) | Honored. Expand / collapse all thinking blocks. |
| `Ctrl+O` | None. `Cmd+O` is "Open..."; `Ctrl+O` is free | `Ctrl+O` is TTY `discard` (toggle output flush) in cooked mode; only active when stdin is the shell. Once the TUI owns raw mode it's free | None | Honored. Expand / collapse all tool cards. |
| `Ctrl+C` | `Cmd+C` is "Copy" — TUI does not use `Ctrl+C`. `Ctrl+C` itself is free on macOS | TTY `intr` → SIGINT. Resolved by the TUI entering raw mode, at which point `Ctrl+C` arrives as byte `0x03` and is safe to bind | Console host: SIGINT (with no selection) or Copy (with selection). In a TUI process taking raw input, the host shortcuts are inactive | Honored. Clear editor if non-empty; otherwise quit. Relies on the TUI already being in raw mode. In conhost without raw mode, `Ctrl+C` will still terminate the process. The TUI must always be running raw. |
| `Ctrl+D` | `Cmd+D` is "Don't Save" in dialogs and bookmark this page in some browsers; `Ctrl+D` is free | TTY `eof` → log out when line empty. In raw mode, byte `0x04` is free | Free (Windows does not reserve `Ctrl+D`) | Honored, but only when pressed twice within 500 ms. The double-tap avoids the EOF implication on Linux cooked mode. |
| `Ctrl+↑` / `Ctrl+↓` | `Cmd+↑` / `Cmd+↓` are "Move to beginning/end of document" in many macOS apps; `Ctrl+↑` is free | `Ctrl+↑` / `Ctrl+Down` are readline: only inside a readline prompt. In raw-mode TUI they're free | Windows Terminal binds `Ctrl+Shift+Up` / `Ctrl+Shift+Down` to scrollback, not `Ctrl+Up`/`Ctrl+Down` | Honored. Focus previous / next agent in the rail. |

### Bindings the TUI explicitly avoids

The following keys are reserved by one or more platforms and the TUI keeps them free, even though they would be convenient for in-app commands:

- `Cmd+Q` (macOS Quit) — we use `/exit` and `Ctrl+D` instead.
- `Cmd+W` (macOS Close window) — no concept of a closing window in the TUI; would surprise users.
- `Cmd+C` / `Cmd+V` / `Cmd+X` / `Cmd+A` (macOS Edit menu) — the editor uses readline-style `Ctrl+Y` / `Ctrl+U` for yank/kill-line and the TUI does not attempt a uniform text-operations palette; on Linux the equivalent `Ctrl+Shift+C` is owned by the terminal emulator for Copy.
- `Cmd+Space`, `Cmd+Tab`, `Opt+Cmd+Esc` (macOS system) — never bound.
- `Win+L`, `Win+R`, `Win+E`, `Win+D`, `Win+Tab`, `Alt+Tab`, `Alt+F4`, `Ctrl+Esc`, `F12` (Windows system / debugger) — never bound.
- `Ctrl+C`, `Ctrl+\`, `Ctrl+Z`, `Ctrl+S`, `Ctrl+Q`, `Ctrl+D`, `Ctrl+R`, `Ctrl+V` (Linux TTY / readline) in their cooked-mode semantics — the TUI's binding of `Ctrl+C` and `Ctrl+D` is only safe because the TUI is by contract in raw mode. Any future code path that runs the editor inside a non-raw stdin (e.g. a `jie -p`-style line editor driven by readline) must use `Ctrl+C` only through the TTY's standard `intr` semantics — i.e. it sends SIGINT — and not treat it as a free binding.

### Bindings the TUI intentionally mirrors

The TUI inherits a few conventions where they do not conflict:

- Plain `Up` / `Down` for prompt history walking mirrors readline and cmd/PowerShell expectations.
- `Enter` to submit, `Backspace` to erase one char, `Tab` for completion — these match every terminal, every shell, every readline prompt, and every macOS app's text field. They are not bound to a system shortcut anywhere.
- `Esc`-prefixed two-press chord for interrupt (`Esc Esc`) mirrors Vim's convention; macOS apps do not reserve `Esc` unless paired with another modifier, so this is free across platforms.

## Tests

This document is reference material; coverage comes from `tests/e2e/tui/shortcuts.test.ts` (in `tui-user-scenarios.md`). Any change to `tui-shortcuts.md` must:

1. Run the full shortcut matrix end-to-end on macOS, Linux, and Windows runners (the `KeyConflictScan` step listed in `tui-user-scenarios.md` "Test layers").
2. Cross-check every conflict row in the table above. If the resolution is "honored", there must be a unit test that the key is delivered to the TUI input listener; if "avoided", the key must NOT be in `KEYBINDING_MATRIX` in `tui-shortcuts.md`.
