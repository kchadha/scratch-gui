// TODO: access `BlockType` and `ArgumentType` without reaching into VM
// Should we move these into a new extension support module or something?
import ArgumentType from 'scratch-vm/src/extension-support/argument-type';
import BlockType from 'scratch-vm/src/extension-support/block-type';
import log from './log.js';

const updateBlockOnWorkspace = (ScratchBlocks, workspace, blockId, blockInfo) => {
    const block = workspace.getBlockById(blockId);
    // TODO this seems hacky but is needed for how defineDynamicBlock currently works.
    block.needsBlockInfoUpdate = true;
    block.secondInit = true;
    // TODO do we need to use xml-escape here?
    block.blockInfoText = JSON.stringify(blockInfo);
    const mutation = block.mutationToDom();
    block.domToMutation(mutation);
};

// TODO: grow this until it can fully replace `_convertForScratchBlocks` in the VM runtime
const defineDynamicBlock = (guiContext, ScratchBlocks, categoryInfo, staticBlockInfo, extendedOpcode) => ({
    init: function () {
        const blockJson = {
            type: extendedOpcode,
            inputsInline: true,
            category: categoryInfo.name,
            colour: categoryInfo.color1,
            colourSecondary: categoryInfo.color2,
            colourTertiary: categoryInfo.color3
        };
        // There is a scratch-blocks / Blockly extension called "scratch_extension" which adjusts the styling of
        // blocks to allow for an icon, a feature of Scratch extension blocks. However, Scratch "core" extension
        // blocks don't have icons and so they should not use 'scratch_extension'. Adding a scratch-blocks / Blockly
        // extension after `jsonInit` isn't fully supported (?), so we decide now whether there will be an icon.
        if (staticBlockInfo.blockIconURI || categoryInfo.blockIconURI) {
            blockJson.extensions = ['scratch_extension'];
        }

        // Handle custom context menu options
        // TODO this should probably not live here in the future, or at least
        // we need some way of registering a context menu option only once for
        // each block (see try catch below)
        if (staticBlockInfo.info.customContextMenu) {
            const customContextMenuForBlock = {
                customContextMenu: function (options) {
                    staticBlockInfo.info.customContextMenu.forEach(contextOption => {
                        options.push({
                            enabled: true,
                            text: contextOption.name,
                            callback: () => {
                                if (contextOption.builtInCallback) {
                                    switch (contextOption.builtInCallback) {
                                    case 'EDIT_A_PROCEDURE': {
                                        const oldProccode = this.procCode_;
                                        const oldMutation = this.mutationToDom();
                                        guiContext.props.onActivateCustomProcedures(
                                            oldMutation, (mutation => {
                                                contextOption.callback({oldProccode, mutation});
                                                if (mutation.proccode !== this.procCode_) {
                                                    ScratchBlocks.Events.fire(new ScratchBlocks.Events.BlockChange(this,
                                                        'mutation', null, ScratchBlocks.Xml.domToText(oldMutation), ScratchBlocks.Xml.domToText(mutation)));
                                                }
                                            }));
                                        break;
                                    }
                                    case 'RENAME_A_VARIABLE':
                                        // TODO FILL THIS IN
                                        break;
                                    }
                                } else if (contextOption.callback) {
                                    contextOption.callback();
                                }
                            }
                        });
                    });
                }
            };
            const contextMenuName = `${blockJson.type}_context_menu`;
            try {
                ScratchBlocks.Extensions.registerMixin(contextMenuName, customContextMenuForBlock);
            } catch (e) {
                log.warn("Context menu callback was already registered, but we're going to ignore this for now");
            }
            blockJson.extensions = blockJson.extensions || [];
            blockJson.extensions.push(contextMenuName);
        }

        this.jsonInit(blockJson);
        this.blockInfoText = '{}';
        this.needsBlockInfoUpdate = true;
        // TODO Needed for custom procs, figure out how to separate this specific
        // info from this function. Or maybe this will get removed when proc definitions
        // are extensionified.
        this.procCode_ = null;
    },
    mutationToDom: function () {
        const container = document.createElement('mutation');
        container.setAttribute('blockInfo', this.blockInfoText);

        // TODO this is temporary custom procedure glue code
        if (this.procCode_) {
            container.setAttribute('proccode', this.procCode_);
            // container.setAttribute('argumentids', `["aifjefoejf${uid}", "eatsrjdyfugi${++uid}"]`);
            // container.setAttribute('argumentnames', '["number or text", "boolean"]');
            // container.setAttribute('argumentdefaults', '["", "false"]');
            container.setAttribute('argumentids', JSON.stringify(this.argumentIds_));
            container.setAttribute('argumentnames', JSON.stringify(this.argumentNames_));
            container.setAttribute('argumentdefaults', JSON.stringify(this.argumentDefaults_));
            container.setAttribute('warp', 'false');
        }

        return container;
    },
    domToMutation: function (xmlElement) {
        const blockInfoText = xmlElement.getAttribute('blockInfo');
        if (!blockInfoText) return;
        if (!this.needsBlockInfoUpdate) {
            throw new Error('Attempted to update block info twice');
        }
        delete this.needsBlockInfoUpdate;
        this.blockInfoText = blockInfoText;
        const blockInfo = JSON.parse(blockInfoText);

        // TODO this is temporary custom procedure glue code
        if (blockInfo.proccode) {
            this.procCode_ = blockInfo.proccode;
            this.argumentIds_ = blockInfo.argumentIds;
            this.argumentDefaults_ = blockInfo.argumentDefaults;
            this.argumentNames_ = blockInfo.argumentNames;
            this.generateShadows_ = blockInfo.generateShadows;
        }

        switch (blockInfo.blockType) {
        case BlockType.COMMAND:
        case BlockType.CONDITIONAL:
        case BlockType.LOOP:
            this.setOutputShape(ScratchBlocks.OUTPUT_SHAPE_SQUARE);
            this.setPreviousStatement(true);
            this.setNextStatement(!blockInfo.isTerminal);
            break;
        case BlockType.REPORTER:
            this.setOutput(true);
            this.setOutputShape(ScratchBlocks.OUTPUT_SHAPE_ROUND);
            if (!blockInfo.disableMonitor) {
                this.setCheckboxInFlyout(true);
            }
            break;
        case BlockType.BOOLEAN:
            this.setOutput(true);
            this.setOutputShape(ScratchBlocks.OUTPUT_SHAPE_HEXAGONAL);
            break;
        case BlockType.HAT:
        case BlockType.EVENT:
            this.setOutputShape(ScratchBlocks.OUTPUT_SHAPE_SQUARE);
            this.setNextStatement(true);
            break;
        }

        // Layout block arguments
        // TODO handle E/C Blocks
        const blockText = blockInfo.text;
        const args = [];
        let argCount = 0;
        const scratchBlocksStyleText = blockText.replace(/\[(.+?)]/g, (match, argName) => {
            const arg = blockInfo.arguments[argName];
            switch (arg.type) {
            case ArgumentType.STRING:
                args.push({type: 'input_value', name: argName});
                break;
            case ArgumentType.BOOLEAN:
                args.push({type: 'input_value', name: argName, check: 'Boolean'});
                break;
            }
            return `%${++argCount}`;
        });

        if (this.secondInit) {
            this.updateDisplay_();
        } else {
            this.interpolate_(scratchBlocksStyleText, args);
        }
        // this.interpolate_(scratchBlocksStyleText, args);
    },
    getProcCode: ScratchBlocks.ScratchBlocks.ProcedureUtils.getProcCode,
    removeAllInputs_: ScratchBlocks.ScratchBlocks.ProcedureUtils.removeAllInputs_,
    disconnectOldBlocks_: ScratchBlocks.ScratchBlocks.ProcedureUtils.disconnectOldBlocks_,
    deleteShadows_: ScratchBlocks.ScratchBlocks.ProcedureUtils.deleteShadows_,
    createAllInputs_: ScratchBlocks.ScratchBlocks.ProcedureUtils.createAllInputs_,
    updateDisplay_: ScratchBlocks.ScratchBlocks.ProcedureUtils.updateDisplay_,

    populateArgument_: ScratchBlocks.ScratchBlocks.ProcedureUtils.populateArgumentOnCaller_,
    addProcedureLabel_: ScratchBlocks.ScratchBlocks.ProcedureUtils.addLabelField_,

    // Only exists on the external caller.
    attachShadow_: ScratchBlocks.ScratchBlocks.ProcedureUtils.attachShadow_,
    buildShadowDom_: ScratchBlocks.ScratchBlocks.ProcedureUtils.buildShadowDom_
});

export {
    defineDynamicBlock as default,
    updateBlockOnWorkspace
};
