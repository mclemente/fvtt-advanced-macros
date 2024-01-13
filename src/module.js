/**
 * Author: Matheus Clemente (https://github.com/mclemente) & 4535992 (https://github.com/p4535992)
 * Software License: MIT
 */

let socket;
Hooks.once("socketlib.ready", () => {
  //@ts-ignore
  socket = socketlib.registerModule("advanced-macros");
  socket.register("executeMacro", async (...inAttributes) => {
    if (!Array.isArray(inAttributes)) {
      throw new Error(`Advanced Macros | inAttributes must be of type Array, found type: ${typeof inAttributes}`);
    }
    let [macroId, args] = inAttributes;
    const macro = getMacroSync(macroId); //game.macros.get(macroId);
    const runAsPersonal = macro.getFlag("advanced-macros", "runAsPersonal");
    if (runAsPersonal) {
      return await runMacro(macro, args);
    } else {
      return macro?.execute(args, true);
    }
  });
});

Hooks.once("init", () => {
  game.settings.register("advanced-macros", "legacySlashCommand", {
    name: `advanced-macros.setting.legacySlashCommand.name`,
    hint: `advanced-macros.setting.legacySlashCommand.hint`,
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });
  libWrapper.register(
    "advanced-macros",
    "Macro.prototype.canExecute",
    function () {
      if (!this.testUserPermission(game.user, "LIMITED")) return false;
      return this.type === "script" ? game.user.can("MACRO_SCRIPT") || (canRunAsGM(this) && !game.user.isGM) : true;
    },
    "OVERRIDE"
  );
  libWrapper.register(
    "advanced-macros",
    "Macro.prototype.execute",
    async function (wrapped, scope = {}, callFromSocket = false) {
      if (!this.canExecute) {
        return ui.notifications.warn(`You do not have permission to execute Macro "${this.name}".`);
      }
      switch (this.type) {
        case "chat":
          return wrapped();
        case "script":
          let runFor = this.getFlag("advanced-macros", "runForSpecificUser");
          const runAsGM = this.getFlag("advanced-macros", "runAsGM");
          const runAsWorldScript = this.getFlag("advanced-macros", "runAsWorldScript");
          const runAsPersonal = this.getFlag("advanced-macros", "runAsPersonal");
          if (runAsGM && canRunAsGM(this)) {
            runFor = "GM";
          } else {
            if (runAsWorldScript) {
              runFor = "runAsWorldScript";
            }
          }
          if (runFor === "MYSELF") {
            runFor = game.user.id;
          }
          if (callFromSocket || !runFor || runFor === "runAsWorldScript" || !canRunAsGM(this)) {
            if (runAsPersonal) {
              return socket.executeForUsers("executeMacro", [game.user.id], this.id, scope);
            } else {
              return wrapped(scope);
            }
          } else if (runFor == "GM") {
            if (game.users.activeGM?.isSelf) {
              if (runAsPersonal) {
                return socket.executeForUsers("executeMacro", [game.user.id], this.id, scope);
              } else {
                return wrapped(scope);
              }
            }
            return socket.executeAsGM("executeMacro", this.id, scope);
          } else if (runFor == "runForEveryone") {
            return socket.executeForEveryone("executeMacro", this.id, scope);
          } else if (runFor == "runForEveryoneElse") {
            return socket.executeForOthers("executeMacro", this.id, scope);
          } else if (runFor) {
            return socket.executeForUsers("executeMacro", [runFor], this.id, scope);
          }
      }
    },
    "MIXED"
  );
  libWrapper.register(
    "advanced-macros",
    "TextEditor._createContentLink",
    (match, { async = false, relativeTo } = {}) => {
      let [type, target, hash, name] = match.slice(1, 5);

      // Prepare replacement data
      const data = {
        cls: ["content-link"],
        icon: null,
        dataset: {},
        name,
      };

      let doc;
      let broken = false;
      const scope = {};
      if (type === "UUID") {
        if (target.split(".")[0] == "Macro" && /\s/g.test(match[4])) {
          const macro = game.macros.get(target.split(".")[1]);
          let params = match[4].replace(`${macro.name} `, "").split(" ");
          for (const p of params) {
            const kv = p.split("=");
            if (kv.length === 2) {
              scope[kv[0]] = kv[1];
            }
          }
          data.name = macro.name;
        }
        data.dataset = { id: null, uuid: target, scope };
        if (async) doc = fromUuid(target, { relative: relativeTo });
        else {
          try {
            doc = fromUuidSync(target, { relative: relativeTo });
          } catch (err) {
            [type, ...target] = target.split(".");
            broken = TextEditor._createLegacyContentLink(type, target.join("."), name, data);
          }
        }
      } else broken = TextEditor._createLegacyContentLink(type, target, name, data);

      // Flag a link as broken
      if (broken) {
        data.icon = "fas fa-unlink";
        data.cls.push("broken");
      }

      const constructAnchor = (doc) => {
        if (doc) {
          if (doc.documentName) {
            const attrs = { draggable: true };
            if (hash) attrs["data-hash"] = hash;
            return doc.toAnchor({
              attrs,
              dataset: { scope: Object.keys(data.dataset.scope), ...data.dataset.scope },
              classes: data.cls,
              name: data.name,
            });
          }
          data.name = data.name || doc.name || target;
          const type = game.packs.get(doc.pack)?.documentName;
          data.dataset.type = type;
          data.dataset.id = doc._id;
          data.dataset.pack = doc.pack;
          if (hash) data.dataset.hash = hash;
          data.icon = CONFIG[type].sidebarIcon;
        } else if (type === "UUID") {
          // The UUID lookup failed so this is a broken link.
          data.icon = "fas fa-unlink";
          data.cls.push("broken");
        }

        const a = document.createElement("a");
        a.classList.add(...data.cls);
        a.draggable = true;
        for (let [k, v] of Object.entries(data.dataset)) {
          a.dataset[k] = v;
        }
        a.innerHTML = `<i class="${data.icon}"></i>${data.name}`;
        return a;
      };

      if (doc instanceof Promise) return doc.then(constructAnchor);
      return constructAnchor(doc);
    },
    "OVERRIDE"
  );
  libWrapper.register(
    "advanced-macros",
    "TextEditor._onClickContentLink",
    async (event) => {
      event.preventDefault();
      const doc = await fromUuid(event.currentTarget.dataset.uuid);
      if (event.currentTarget.dataset.type !== "Macro") return doc?._onClickDocumentLink(event);
      else {
        const scope = {};
        if (event.currentTarget.dataset.scope) {
          const params = event.currentTarget.dataset.scope.split(",");
          for (const p of params) {
            scope[p] =
              event.currentTarget.dataset[p] === "true" ||
              (event.currentTarget.dataset[p] === "false" ? false : event.currentTarget.dataset[p]);
          }
        }
        // TODO set up logic check when to callFromSocket or not
        return doc?.execute(scope);
      }
    },
    "OVERRIDE"
  );
  Macro.metadata.preserveOnImport.push("author");
});

Hooks.on("chatMessage", (chatLog, message, chatData) => {
  // Ignore messages starting with "<" or matching a macro pattern.
  if (message.trim().startsWith("<") || message.match(chatLog.constructor.MESSAGE_PATTERNS["macro"])) return true;
  if (!game.settings.get("advanced-macros", "legacySlashCommand")) return;
  // If the message contains an invalid command and starts with a "/", try to process macros in it.
  let [command, match] = chatLog.constructor.parse(message);
  if (command === "invalid" && message.trim().startsWith("/")) {
    const messageArray = message.slice(1).split(" ");
    let macroName = messageArray[0];
    let macro = game.macros.getName(macroName);
    messageArray.slice(1).forEach((token) => {
      if (!macro) {
        macroName += ` ${token}`;
        macro = game.macros.getName(macroName);
      }
      if (macro) return;
    });
    if (macro) {
      [command, match] = chatLog.constructor.parse(`/macro ${message.slice(1)}`);
      chatLog._processMacroCommand(command, match);
      return false;
    }
  }
  return true;
});

Hooks.once("ready", () => {
  Hooks.on("renderMacroConfig", (obj, html, data) => {
    if (!game.user.isGM) return;
    const macro = obj.object;
    // A re-render will cause the html object to be the internal element, which is the form itself.
    const form = html.find("form").length === 0 ? html : html.find("form");
    const typeGroup = form.find("select[name=type]").parent(".form-group");
    const runForSpecificUser = macro.getFlag("advanced-macros", "runForSpecificUser");
    const options = [
      { value: "", label: game.i18n.localize("advanced-macros.MACROS.runAsNoneOption") },
      {
        value: "GM",
        label: game.i18n.localize(`advanced-macros.MACROS.runAsGMOption`), // game.i18n.localize("USER.RoleGamemaster"),
        selected: runForSpecificUser === "GM",
      },
      ...["runForEveryone", "runForEveryoneElse", "runAsWorldScript"].map((run) => ({
        value: run,
        label: game.i18n.localize(`advanced-macros.MACROS.${run}Option`),
        selected: runForSpecificUser === run,
      })),
      {
        value: "MYSELF",
        label: game.i18n.format(`advanced-macros.MACROS.runAsMySelfOption`, { name: game.user.name }),
        selected: runForSpecificUser === "MYSELF",
      },
      ...game.users
        .filter((user) => !user.isGM)
        .map((user) => ({
          value: user.id,
          label: user.name,
          selected: runForSpecificUser === user.id,
        })),
    ]; // filter out null values

    const optionElements = options
      .map((option) => {
        const selectedAttr = option.selected ? 'selected="selected"' : "";
        return `<option value="${option.value}" ${selectedAttr}>${option.label}</option>`;
      })
      .join("");

    const specificOneDiv = $(`
			<div class="form-group"
				${macro.type === "chat" ? 'style="display: none"' : ""}
				data-tooltip="${game.i18n.localize("advanced-macros.MACROS.runForSpecificUserTooltip")}" data-tooltip-direction="UP">
				<label>${game.i18n.localize("advanced-macros.MACROS.runForSpecificUser")}</label>
				<select name="flags.advanced-macros.runForSpecificUser" ${canRunAsGM(macro) ? "" : "disabled"}>
					${optionElements}
				</select>
			</div>
		`);

    specificOneDiv.insertAfter(typeGroup);

    // Add World Script checkbox
    const runAsWorldScript = macro.getFlag("advanced-macros", "runAsWorldScript");
    const worldScriptDiv = $(`
      <div class="form-group" 
        data-tooltip="${game.i18n.localize(
          "advanced-macros.MACROS.runAsWorldScriptTooltip"
        )}" data-tooltip-direction="UP">
        <label class="form-group">
          <span>${game.i18n.localize("advanced-macros.MACROS.runAsWorldScript")}</span>
          <input type="checkbox"
            name="flags.advanced-macros.runAsWorldScript"
            data-dtype="Boolean"
            ${runAsWorldScript ? "checked" : ""} />
        </label>
      </div>
    `);
    worldScriptDiv.insertAfter(specificOneDiv);

    // Add runAsGM checkbox
    if (game.user.isGM) {
      const runAsGM = macro.getFlag("advanced-macros", "runAsGM");
      const canRunAsGMB = canRunAsGM(macro);
      const gmDiv = $(`
        <div class="form-group" 
          data-tooltip="${game.i18n.localize("advanced-macros.MACROS.runAsGMTooltip")}" data-tooltip-direction="UP">
          <label class="form-group">
            <span>${game.i18n.localize("advanced-macros.MACROS.runAsGM")}</span>
            <input type="checkbox"
              name="flags.advanced-macros.runAsGM"
              data-dtype="Boolean"
              ${runAsGM ? "checked" : ""}
              ${!canRunAsGMB ? "disabled" : ""}/>
          </label>
        </div>
      `);
      gmDiv.insertAfter(specificOneDiv);
    }

    const runAsPersonal = macro.getFlag("advanced-macros", "runAsPersonal");
    const personalDiv = $(`
    <fieldset>
        <legend>${game.i18n.localize("advanced-macros.MACROS.runAsPersonalTitle")}</legend>
        <p class="notes">Executes Macro command, giving speaker, actor, token, character, and event constants. This is recognized as the macro itself. Pass an event as the first argument. Is the same concept used from 'Item Macro' and 'Item Piles'. The macro is launched under as a asynchronus call so 'await' command are good.</p>
        <p class="notes">
        So when you set up to run a macro with this module these arguments are already "setted":
        <ul>
          <li><b>speaker</b>: The chat message speaker referenced to the actor.</li>
          <li><b>actor</b>: The actor reference passed as argument or by default the character actor referenced to the current user.</li>
          <li><b>token</b>: The token (if present on the current scene) passed as argument, or by default the one referenced to the actor.</li>
          <li><b>character</b>: The character is the actor reference to the one set to the player (cannot be the same of the actor reference).</li>
          <li><b>event</b>: The javascript event passed from the module to the macro.</li>
          <li><b>args</b>: Additional arguments passed from the module to the macro.</li>
        </ul>
        </p>
        <div class="form-group">
          <label class="form-group">
          <span>${game.i18n.localize("advanced-macros.MACROS.runAsPersonal")}</span>
            <input type="checkbox"
              name="flags.advanced-macros.runAsPersonal"
              data-dtype="Boolean"
              ${runAsPersonal ? "checked" : ""} />
          </label>
        </div>
    </fieldset>
    `);
    personalDiv.insertAfter(worldScriptDiv);

    const typeSelect = form.find("select[name=type]");
    typeSelect.on("change", (event) => {
      if (event.target.value === "chat") specificOneDiv.hide();
      else specificOneDiv.show();
    });
  });
  const worldScripts = game.macros.contents.filter(
    (macro) => getProperty(macro, `flags.advanced-macros.runForSpecificUser`) === "runAsWorldScript"
  );
  for (const macro of worldScripts) {
    try {
      macro.execute();
      console.debug(`Advanced Macros | Executed "${macro.name}" world script (ID: ${macro.id})`);
    } catch (err) {
      console.error(`Advanced Macros | Error executing "${macro.name}" world script (ID: ${macro.id})`, err);
    }
  }
});

/**
 * Defines whether a Macro can run as a GM.
 * For security reasons, only macros authored by the GM, and not editable by users
 * can be run as GM
 */
function canRunAsGM(macro) {
  const author = game.users.get(macro.author?.id);
  const permissions = deepClone(macro.ownership) || {};

  for (const user of game.users.contents) {
    if (user.isGM || user.id === author?.id) delete permissions[user.id];
  }
  const highestPermissionLevel = Math.max(...Object.values(permissions));
  return author?.isGM && highestPermissionLevel < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}

function stringIsUuid(inId) {
  return typeof inId === "string" && (inId.match(/\./g) || []).length && !inId.endsWith(".");
}

function getMacroSync(target, ignoreError = false, ignoreName = true) {
  let targetTmp = target;
  if (!targetTmp) {
    throw new Error(`Advanced Macros | Macro is undefined`, true, targetTmp);
  }
  if (targetTmp instanceof Macro) {
    return targetTmp;
  }
  // This is just a patch for compatibility with others modules
  if (targetTmp.document) {
    targetTmp = targetTmp.document;
  }
  if (targetTmp.uuid) {
    targetTmp = targetTmp.uuid;
  }

  if (targetTmp instanceof Macro) {
    return targetTmp;
  }
  if (stringIsUuid(targetTmp)) {
    targetTmp = fromUuidSync(targetTmp);
  } else {
    targetTmp = game.macros.get(targetTmp);
    if (!targetTmp && !ignoreName) {
      targetTmp = game.macros.getName(targetTmp);
    }
  }
  if (!targetTmp) {
    if (ignoreError) {
      console.warn(`Advanced Macros | Macro is not found`, true, targetTmp);
      return;
    } else {
      throw new Error(`Advanced Macros | Macro is not found`, true, targetTmp);
    }
  }
  // Type checking
  if (!(targetTmp instanceof Macro)) {
    if (ignoreError) {
      console.warn(`Advanced Macros | Invalid Macro`, true, targetTmp);
      return;
    } else {
      throw new Error(`Advanced Macros | Invalid Macro`, true, targetTmp);
    }
  }
  return targetTmp;
}

async function getMacroAsync(target, ignoreError = false, ignoreName = true) {
  let targetTmp = target;
  if (!targetTmp) {
    throw new Error(`Advanced Macros | Macro is undefined`, true, targetTmp);
  }
  if (targetTmp instanceof Macro) {
    return targetTmp;
  }
  // This is just a patch for compatibility with others modules
  if (targetTmp.document) {
    targetTmp = targetTmp.document;
  }
  if (targetTmp.uuid) {
    targetTmp = targetTmp.uuid;
  }

  if (targetTmp instanceof Macro) {
    return targetTmp;
  }
  if (stringIsUuid(targetTmp)) {
    targetTmp = await fromUuid(targetTmp);
  } else {
    targetTmp = game.macros.get(targetTmp);
    if (!targetTmp && !ignoreName) {
      targetTmp = game.macros.getName(targetTmp);
    }
  }
  if (!targetTmp) {
    if (ignoreError) {
      console.warn(`Advanced Macros | Macro is not found`, true, targetTmp);
      return;
    } else {
      throw new Error(`Advanced Macros | Macro is not found`, true, targetTmp);
    }
  }
  // Type checking
  if (!(targetTmp instanceof Macro)) {
    if (ignoreError) {
      console.warn(`Advanced Macros | Invalid Macro`, true, targetTmp);
      return;
    } else {
      throw new Error(`Advanced Macros | Invalid Macro`, true, targetTmp);
    }
  }
  return targetTmp;
}

async function runMacro(macroReference, ...macroData) {
  let macroFounded = await getMacroAsync(macroReference, false, true);
  if (!macroFounded) {
    throw new Error(`Advanced Macros | Could not find macro with reference "${macroReference}"`, true);
  }
  // Credit to Otigon, Zhell, Gazkhan and MrVauxs for the code in this section
  /*
    let macroId = macro.id;
    if (macroId.startsWith("Compendium")) {
      let packArray = macroId.split(".");
      let compendium = game.packs.get(`${packArray[1]}.${packArray[2]}`);
      if (!compendium) {
        throw new Error(`Advanced Macros | Compendium ${packArray[1]}.${packArray[2]} was not found`, true);
      }
      let findMacro = (await compendium.getDocuments()).find(m => m.name === packArray[3] || m.id === packArray[3])
      if (!findMacro) {
        throw new Error(`Advanced Macros | The "${packArray[3]}" macro was not found in Compendium ${packArray[1]}.${packArray[2]}`, true);
      }
      macro = new Macro(findMacro?.toObject());
      macro.ownership.default = CONST.DOCUMENT_PERMISSION_LEVELS.OWNER;
    } else {
      macro = game.macros.getName(macroId);
      if (!macro) {
        throw new Error(`Advanced Macros | Could not find macro with name "${macroId}"`, true);
      }
    }
    */
  let result = false;
  try {
    let args = {};
    if (typeof macroData !== "object") {
      // for (let i = 0; i < macroData.length; i++) {
      //   args[String(macroData[i]).trim()] = macroData[i].trim();
      // }
      args = parseAsArray(macroData);
    } else {
      args = macroData;
    }

    // Little trick to bypass permissions and avoid a socket to run as GM
    let macroTmp = new Macro(macroFounded.toObject());
    macroTmp.ownership.default = CONST.DOCUMENT_PERMISSION_LEVELS.OWNER;
    if (macroTmp.type === "chat") {
      result = await macroTmp.execute(args);
    } else if (macroTmp.type === "script") {
      //add variable to the evaluation of the script
      const macro = macroTmp;
      const actor = getUserCharacter();
      const speaker = ChatMessage.getSpeaker({ actor: actor });
      const token = canvas.tokens.get(actor.token);
      const character = game.user.character;
      const event = getEvent();

      console.log("Advanced Macros | runMacro | ", { macro, speaker, actor, token, character, event, args });

      //build script execution
      let body = ``;
      if (macro.command.trim().startsWith(`(async ()`)) {
        body = macro.command;
      } else {
        body = `(async ()=>{
            ${macro.command}
          })();`;
      }
      const fn = Function("speaker", "actor", "token", "character", "event", "args", body);

      console.log("Advanced Macros | runMacro | ", { body, fn });

      //attempt script execution
      try {
        result = fn.call(macro, speaker, actor, token, character, event, args);
      } catch (err) {
        throw new Error(`Advanced Macros | error macro Execution`, err);
      }

      function getEvent() {
        let a = args[0];
        if (a instanceof Event) {
          return args[0].shift();
        }
        if (a?.originalEvent instanceof Event) {
          return args.shift().originalEvent;
        }
        return undefined;
      }
    } else {
      console.warn(`Advanced Macros | Something is wrong a macro can be only a 'char' or a 'script'`);
    }
  } catch (err) {
    throw new Error(`Advanced Macros |  Error when executing macro ${macroReference}!`, macroDataArr, err);
  }

  return result;
}

function getOwnedCharacters(user = false) {
  user = user || game.user;
  return game.actors
    .filter((actor) => {
      return actor.ownership?.[user.id] === CONST.DOCUMENT_PERMISSION_LEVELS.OWNER && actor.prototypeToken.actorLink;
    })
    .sort((a, b) => {
      return b._stats.modifiedTime - a._stats.modifiedTime;
    });
}

function getUserCharacter(user = false) {
  user = user || game.user;
  return user.character || (user.isGM ? false : getOwnedCharacters(user)?.[0] ?? false);
}
