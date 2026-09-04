# winget manifests

What `winget install Cromis.Alcove` needs. One folder per released version.

Validate before submitting:

```bat
winget validate --manifest packaging\winget\0.2.4
```

Submitting means a PR to [microsoft/winget-pkgs], with the folder copied to
`manifests/c/Cromis/Alcove/<version>/`. `wingetcreate submit` does the fork,
branch and PR in one step:

```bat
wingetcreate submit --token <github-pat> packaging\winget\0.2.4
```

Their CI installs the package in a sandbox and checks the hash. Expect a
moderator to look at it by hand the first time, since the installer is not
Authenticode-signed.

For the next release, `wingetcreate update Cromis.Alcove --version <ver> --urls <url>`
fetches the installer, computes the hash and writes the new folder for you.

[microsoft/winget-pkgs]: https://github.com/microsoft/winget-pkgs
