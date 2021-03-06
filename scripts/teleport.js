    Hooks.once("init", async function() {
        //Setting modified methods into foundry
        Note.prototype._onClickLeft2 = teleportpoint._onClickLeft2;
        Note.prototype._onClickRight2 = teleportpoint._onClickRight2;
        KeyboardManager.prototype._handleMovement = teleportpoint._handleMovement;
        Token.prototype.animateMovement = teleportpoint._animateMovement;
        Token.prototype.setPosition = teleportpoint._setPosition;
        // Adding Icons for TeleportSheetConfig sheet
        CONFIG.Teleport = {
                                    noteIcons: {
                                      "Bridge": "modules/teleport/icons/bridge.svg",
                                      "Cave": "modules/teleport/icons/cave.svg",
                                      "Castle": "modules/teleport/icons/castle.svg",
                                      "City": "modules/teleport/icons/city.svg",
                                      "House": "modules/teleport/icons/house.svg",
                                      "Ladder": "modules/teleport/icons/ladder.svg",
                                      "Mountain": "modules/teleport/icons/mountain.svg",
                                      "Oak Tree": "modules/teleport/icons/oak.svg",
                                      "Obelisk": "modules/teleport/icons/obelisk.svg",
                                      "Ruins": "modules/teleport/icons/ruins.svg",
                                      "Statue": "modules/teleport/icons/statue.svg",
                                      "Stairs": "modules/teleport/icons/3d-stairs.svg",
                                      "Temple": "modules/teleport/icons/temple.svg",
                                      "Tower": "modules/teleport/icons/tower.svg",
                                      "Village": "modules/teleport/icons/village.svg",
                                      "Waterfall": "modules/teleport/icons/waterfall.svg",
                                      "Windmill": "modules/teleport/icons/windmill.svg",
                                      "Wooden Door": "modules/teleport/icons/wooden-door.svg"
                                    },
                                    defaultIcon: "modules/teleport/icons/3d-stairs.svg"
                        };
        game.teleport = {
                            tp: teleportpoint
                        };

        //Register settings
        game.settings.register("teleport", "hidedepartingtokens", {
            name: "Hide Departing Tokens",
            hint: "Hide tokens on the original scene when you teleport them to a new one.",
            scope: "world",
            type: Boolean,
            config: true,
            default: false
        });

        game.settings.register("teleport", "activatescene", {
            name: "Activate Scene",
            hint: "GM's only: Activate the destination scene once tokens are teleported.",
            scope: "world",
            type: Boolean,
            config: true,
            default: true
        });

        game.settings.register("teleport", "toggleaddtpbutton", {
          name: "Toggle Add TP",
          hint: "Keep track of the Add TP button's state",
          scope: "client",
          config: false,
          default: false,
          type: Boolean
        });
        game.settings.set("teleport","toggleaddtpbutton",false);

        console.log(`Teleport | Initialization of Teleport module for FoundryVTT is completed.`);
    });

    /**
    * Hook that set the mouseUp handler for the board div.
    **/
    Hooks.once("ready", async() => {
        const folder = await createTeleportFolder();
        await createTeleportationJournal(folder);
        const board = $(document.getElementById("board"));
        board.on("mouseup",e => teleportpoint._onMouseUp(e));
		board.on("mousedown", e => {if(e.button==1)return false}); //Disable autoscrolling on middle button
        teleportpoint._oldOnClickLeft2 = NotesLayer.prototype._onClickLeft2; //Saves the notelayer double left click to restore it
        teleportpoint.socketListeners(game.socket);
        //Load icons used on the TP sheet config.
        await loadTPIcons();
    });

    /**
    * Hook that set loaded flag for the a scene.
    **/
    Hooks.on("canvasReady", canvas => {
        canvas.scene.options["loaded"] = true;
    });

    /**
    * Hook that set the "Add Teleport Point on the Note controls bar"
    **/
    Hooks.on('getSceneControlButtons', controls => {
        let noteButton = controls.find(b => b.name === "notes");

        if (noteButton) {
            noteButton.tools.push({
                name: "teleportation",
                title: "Toggle Add Teleportation Point",
                icon: "fab fa-firstdraft",
                toggle: true,
                active: game.settings.get("teleport","toggleaddtpbutton"),
                visible: game.user.isGM,
                onClick: (value) => {
                    game.settings.set("teleport","toggleaddtpbutton", !(game.settings.get("teleport","toggleaddtpbutton")));
                    if (game.settings.get("teleport","toggleaddtpbutton")) {
                        NotesLayer.prototype._onClickLeft2 = teleportpoint._onDoubleClick;
                    }
                    else {
                        NotesLayer.prototype._onClickLeft2 = teleportpoint._oldOnClickLeft2;
                    }
                }
            });
        }
    });

    /**
    * Hooks fired when deleting a note.
    **/

    Hooks.on("deleteNote", (scene, note, options, userId) =>{
        try {
            if ("teleport" in note.flags) game.journal.get(note.entryId).delete();
        }
        catch (e) {
        }
        return canvas.activeLayer._hover ? canvas.activeLayer._hover = null : null;
    });

    /**
    * Hooks fired on the player side when a new token is created, also the hooks center the
    * player's view on the teleported token.
    **/

    Hooks.on("teleportation",async (sceneTo,noteTo,result,userId) =>{
        if (game.user.isGM) return;
        if (userId !== game.user.id) return;
        if (result) return;
        const scene = game.scenes.get(sceneTo);
        if (!scene.options["loaded"]) {
            await game.scenes.preload(sceneTo)
            scene.options["loaded"] = true;
            console.log("Teleport | Scene ", scene.data.navName ," was preloaded."); // May not be necessary to change this as it is in the console, not a popup
        }
        const note = scene.getEmbeddedEntity("Note",noteTo);
        if (canvas.scene._id !== scene._id){
            setTimeout(async () => {
                await scene.view();
                await canvas.animatePan({x:note.x,y:note.y,scale:1,duration:10});
                }, 6000);
            ui.notifications.info("Your DM has teleported your token to the scene " + scene.data.navName + ", wait until is completed.");
        }
        else {
            setTimeout(async () => {
                await canvas.animatePan({x:note.x,y:note.y,scale:1,duration:10});
                }, 3000);
            ui.notifications.info("Your DM has teleported your token to " + note.text + ", wait until is completed.");
        }
    });

    async function loadTPIcons() {
        let toLoad = [];

        toLoad = toLoad.concat(Object.values(CONFIG.Teleport.noteIcons));

        return TextureLoader.loader.load(toLoad, {message: `Loading Teleport Points Icons`});
    }

    async function createTeleportFolder(){
        let tpfolder = game.folders.entities.find(f => f.data.name === "Teleport Points");
        if (!tpfolder) tpfolder = await Folder.create(
                {
                        name: "Teleport Points",
                        type: "JournalEntry",
                        parent: null
                        },
                        { displaySheet: false }
                     );
        return tpfolder
    }

    async function createTeleportationJournal(folder){
        let entry = game.journal.entities.find(t => t.name === "Teleportation");
        if (!entry)
            entry = await JournalEntry.create({name: "Teleportation",folder: folder.id});
        else
            await entry.update({folder: folder.id});
        return entry;
    }