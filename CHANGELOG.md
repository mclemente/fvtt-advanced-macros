### 1.19.3

- BREAKING CHANGES: Integration with [socketlib](https://github.com/manuelVo/foundryvtt-socketlib)
- Add a api integration base on the league guideline `game.modules.get("advanced-macros").api`
- Add a socket integration base on the league guideline `game.modules.get("advanced-macros").socket`
- BREAKING CHANGES: Remove any reference to the old `FURNACE` now everything must be setted with the id of the module `advanced-macros` like in league guideline
- The code has been broken down into multiple files to make future maintenance and development easier, `socket.js`, `api.js`, `constants.js`, `settings.js`, ecc.
- Put all the code under a `src` folder because is a good practices ? and is easier to separate to other no code file like README, CHANGELOG, prettier, ecc.
- Update the gulp for create the release, now you just need to create a release `vX.X.X` and a tag `vX.X.X` 
- Add two option on the macro configuration to run the macro to `all users` or just a `specific one`
- BREAKING CHANGES: the starting chat command is not anymore `/` , but `/amacro` so it easier to manage the intercompatibility with other modules.
- Update the README.md, module.json and the CHANGELOG.md
- Added libwrapper and socketlib as dependencies on the module.json file.