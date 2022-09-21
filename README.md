# Advanced Macros

With Advanced Macros, a "Run Macro" button will appear in macro configuration windows to allow you to quickly test your macro and see its results. Do note that if you use an asynchronous macro which never resolves, you may end up with a macro in an invalid state if you end up cancelling the changes.

Check out the Macros compendium for some useful macros that showcase the advanced macros system as well as provide additional features.

In the case of chat macros, you can now use [handlebars](https://handlebarsjs.com/) templating to render your chat text using common helpers, or use it along with the `macro` helper to call other macros, like for example `{{macro "name of my macro" actor 3 "a text argument"}}` 

In the case of script macros, you can now use a `return` statement for the early return paradigm, but also to retun a string which can then be used in chat macros. You will also be able to receive arguments via an array named `args`, and you can use the `await` keyword to make your script asynchronous. Do note however that if you create an async macro, it cannot be used to return text in a chat macro when using the `{{macro}}` helper. It will still be executed if used, but will be considered to have returned an empty string. If you want to use an async macro that prints its results to chat, read further for the use of recursive async chat commands.

Besides those two enhancements to macros, you can now also create a temporary chat macro with handlebars templating directly from the chat entry, by entering text in the chat that includes the handlebars mustache characters `{{ }}`. You will also be able to call your macro directly from chat with the `/` prefix. As an example, you can send in the chat `/my-macro-name argument1 argument2 argument3`.
If your macro name has spaces in it, you can call it with `/"My macro name" "argument one" 100` for example. You can also call multiple macros by writing them one per line.

In addition, you can now recursively call macros, so you could call a script or chat macro which returns a `/macro-name` text for it to call the macros recursively.

Here is an example of use :
- **Macro name**: `Move token`
- **Type**: script
- **Content**: 
```js
if (!token) return;
await token.update({x: args[0], y: args[1]})
return `Token moved to (${args[0]}, ${args[1]})`
```

- **Macro name**: `pan`
- **Type**: script
- **Content**:
```js
canvas.pan({x: args[0], y: args[1], scale: args[2]})
```

- **Macro name**: `current-time`
- **Type**: script
- **Content**:
```js
const now = new Date();
return `${now.getHours()}:${now.getMinutes()}`;
```

- **Macro name**: `Return to corner`
- **Type**: chat
- **Content**:
```
/"Move token" 0 0
/pan 1000 1000 0.5
It's currently {{macro "current-time"}}
```

- **Macro name**: `run`
- **Type**: chat
- **Content**:
```
/"Return to corner"
```

You can then type `/run` in the chat to execute the 'run' macro which executes 'Return to corner' which will move the token to position (0, 0), then pan the canvas to position (1000, 1000) with a zoom of 50%, then output to the chat `Token moved to (0,0)\n\nIt's currently 21:45`

**Note**: HTML content will not be parsed for /command macros, though you will still be able to use the `{{macro}}` helper in that case. 
**Note 2**: You can only use one space to separate each argument. If you use more than one space, FVTT will replace the second with `&nbsp;` as it transforms the chat input into html, which would break your argument list.

# License
This Foundry VTT module, writen by KaKaRoTo, is licensed under a [Creative Commons Attribution 4.0 International License](http://creativecommons.org/licenses/by/4.0/).

This work is licensed under Foundry Virtual Tabletop [EULA - Limited License Agreement for module development v 0.1.6](http://foundryvtt.com/pages/license.html).
