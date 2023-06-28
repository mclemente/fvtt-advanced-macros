### v2.0.2
- Fixed an issue where macros weren't being found when running them through sockets (#71).
- When the Active GM runs a macro marked as "Run As GM" it is now ran immediately instead of being sent to themselves.
- Added Finnish localization and updated Polish localization, thanks to Weblate contributors.

### v2.0.1
- Fixed an issue when running a macro through sockets (e.g. as GM).
- The user that imports a macro is now set as its Author. This enables GMs to share macros without needing to remake them to access the Execute For Specific User option.
- Updated French localization, thanks to Weblate contributors.

### v2.0.0
#### What is New
- **Run as a World Script:** Setting a macro to run as a World Script will have the same effect as if it was a [world script](https://foundryvtt.wiki/en/basics/world-scripts) (limited to the Ready hook).

#### What is Gone
Foundry V11 has changed a lot of things for macros, some features that were exclusive to this module have become core features.

- **Passing arguments to script macros** Became a Core feature in V11. It differs a bit from how Advanced Macros did it and might break macros that depended on this module.
Specifically, it uses an Object instead of an Array. It sucks having to rewrite your macros, but believe me, it is better in the long run.
-  **Calling script macros with arguments through the chat:** Became a Core feature in V11.
- **Dropping Roll Tables on the macro bar:** Became a Core feature in V11. This was just a leftover feature from when Advanced Macros was part of the extinct Furnace module and has been replicated by other modules a long time ago.
- **Calling Handlebars in chat macros:** NOT introduced in V11, it just isn't worth the hassle after the other changes.
As much as it was a cool feature, it was more a showcase than actually useful, since you could get the same results by through script macros.

#### What Remains
Here's the features that Advanced Macros still does in V11.

- **Call macros by their name on the chat:** Example: instead of calling a `foo` macro  by typing `/macro foo`, you can just type `/foo` in if you enable the Chat Slash Command setting.
This will cause issues with Foundry if you name a macro after another message pattern (e.g. roll, players, etc). You can get a full list of the patterns by inputting `Object.keys(ChatLog.MESSAGE_PATTERNS).sort().join(", ")` on the console.
This might cause issues with your system and other modules if they add their own 
- **Execute script macros as a specific user:** Just open up a macro that was created by you and pick a user that will run that macro if they are only.

### v1.19.3

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
