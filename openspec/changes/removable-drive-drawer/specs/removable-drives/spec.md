## Purpose

Turns a removable volume being plugged in or pulled out into a temporary drawer
on the desk, and gives that drawer a way to eject the volume safely, so a USB
stick is handled on the same surface as everything else instead of in Explorer.

## ADDED Requirements

### Requirement: Removable volumes are enumerated

Alcove SHALL report every mounted volume whose Windows drive type is removable,
with its drive root and a display name. The display name SHALL be the volume
label when one is readable and a generic fallback otherwise.

#### Scenario: A labelled stick is plugged in
- **WHEN** a USB volume labelled `FIELDWORK` is mounted at `E:\`
- **THEN** the enumeration includes an entry with root `E:\` and name `FIELDWORK`

#### Scenario: An unlabelled stick is plugged in
- **WHEN** a removable volume with no readable label is mounted
- **THEN** the enumeration includes it with a generic name, not an empty one

#### Scenario: Fixed disks are not removable
- **WHEN** the machine has a fixed system disk at `C:\`
- **THEN** `C:\` is absent from the enumeration

### Requirement: A removable volume opens as a temporary drawer

While the feature is enabled, Alcove SHALL keep one live-folder drawer per
removable volume, whose folder is the drive root and whose name is the volume's
display name. The drawer SHALL be marked as belonging to that drive root.

#### Scenario: Drawer appears on insert
- **WHEN** a removable volume appears that has no drawer
- **THEN** a drawer for it is added, listing the drive root

#### Scenario: Drawer disappears on removal
- **WHEN** a volume that has a drawer is no longer present
- **THEN** that drawer is removed

#### Scenario: One drawer per drive across refreshes
- **WHEN** the drive list is read again and the same volume is still present
- **THEN** its existing drawer is kept rather than a second one added

#### Scenario: Relabelling keeps the same drawer
- **WHEN** a present volume reports a different label than its drawer's name
- **THEN** the same drawer is kept and renamed

#### Scenario: Disabled means no drawers
- **WHEN** the feature is switched off
- **THEN** no drawer is created for a newly inserted volume, and any existing
  removable drawer is removed

### Requirement: Removable drawers are never persisted

Alcove SHALL exclude removable drawers, and any icons belonging to them, from the
state it writes to disk and to local storage.

#### Scenario: Saved state omits the drawer
- **WHEN** state containing a removable drawer is serialized
- **THEN** the serialized state contains neither that drawer nor its icons

#### Scenario: A restart shows no stale drawer
- **WHEN** Alcove starts from a saved state
- **THEN** no removable drawer exists until a volume is actually enumerated

### Requirement: A removable drawer can eject its volume

A removable drawer SHALL offer an eject action that flushes and dismounts the
volume before reporting success. On success the drawer SHALL close. On failure
the drawer SHALL stay open and the user SHALL be told the eject did not happen.

#### Scenario: Eject succeeds
- **WHEN** the user ejects a removable drawer's volume and the volume dismounts
- **THEN** the drawer closes

#### Scenario: Eject is refused because a file is in use
- **WHEN** the volume cannot be locked because another program holds a file open
- **THEN** the eject reports an error, the drawer stays open, and the user is
  told which drive failed

#### Scenario: Only removable drawers eject
- **WHEN** a drawer is an ordinary folder drawer or a Desktop drawer
- **THEN** no eject action is offered
