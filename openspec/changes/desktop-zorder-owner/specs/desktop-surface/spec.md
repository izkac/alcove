## Purpose

Keeps Alcove sitting where the desktop sits — above the wallpaper and Explorer's
icon list, below every application window — including while the shell raises the
desktop for Show Desktop, so the surface never has to climb back into place and
never flashes doing it.

## ADDED Requirements

### Requirement: Desk windows are owned by the desktop icon host

While Alcove is attached to the desktop, every desk window SHALL have Explorer's
desktop icon host window set as its owner. The owner SHALL be set before the
desk window is shown, and SHALL be cleared when Alcove detaches.

#### Scenario: A desk window is armed on attach
- **WHEN** Alcove attaches and takes over the desktop
- **THEN** each desk window's owner is the window that holds `SHELLDLL_DefView`

#### Scenario: A desk window added for a second monitor is armed
- **WHEN** a desk window is created for a newly connected monitor
- **THEN** that window's owner is the same desktop icon host

#### Scenario: Detaching releases the shell window
- **WHEN** Alcove detaches and restores Explorer's icons
- **THEN** no desk window still names a shell window as its owner

### Requirement: Show Desktop does not displace the surface

Alcove SHALL remain visible and in place when the shell raises the desktop, and
SHALL NOT change its own z-order in response. The surface SHALL NOT be
minimized, hidden, or re-raised by Alcove as part of handling Show Desktop.

#### Scenario: Win+D leaves the desk in place
- **WHEN** the user presses Win+D while Alcove owns the desktop
- **THEN** the desk stays visible with no flash, and Alcove issues no z-order call

#### Scenario: Applications still cover the desk
- **WHEN** an application window is focused over the desk area
- **THEN** that window covers the desk, as it did before

### Requirement: Ownership is restored after the shell restarts

Alcove SHALL detect that a desk window's owner no longer matches the current
desktop icon host and SHALL restore it, without recreating the window.

#### Scenario: Explorer restarts under Alcove
- **WHEN** Explorer restarts and Windows clears the desk window's owner
- **THEN** Alcove finds the new icon host and sets it as owner again

#### Scenario: An armed window is left alone
- **WHEN** a desk window's owner already matches the known icon host
- **THEN** Alcove makes no further window call for it

### Requirement: The desk never comes forward over an application

Clicking the desk SHALL NOT change its z-order. The desk SHALL still accept
focus and input, and SHALL remain behind every application window.

#### Scenario: Clicking the desk leaves applications where they are
- **WHEN** an application is in the foreground and the user clicks a visible part of the desk
- **THEN** the application stays in front of the desk, still covering the area it occupied

#### Scenario: The desk still takes focus
- **WHEN** the user clicks the desk
- **THEN** the desk becomes the focused window, so typing and selection work

#### Scenario: The shell can still lift the desk
- **WHEN** the shell raises the window that owns the desk
- **THEN** the desk rises with it, because that lift does not accompany an activation
