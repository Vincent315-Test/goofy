'use strict';

const { ipcRenderer } = require('electron');
const remote = require('electron').remote;
const webFrame = require('electron').webFrame;

const SpellCheckProvider = require('electron-spell-check-provider');
const buildEditorContextMenu = remote.require('electron-editor-context-menu');

const constants = require('./helpers/constants');

const NEW_MESSAGE_BUTTON = '._1enh ._36ic ._30yy._2oc8';
const SELECTED_CONVERSATION = '._1ht2';
const ACTIVATE_CONVERSATION = 'a._1ht5';

// Settings dropdown
const SETTINGS_BUTTON = '._1enh ._36ic ._4kzu a';  // The "cog" button which shows the Settings dropdown
const SETTINGS_LINK = '._54ni.__MenuItem:first-child';  // The "Settings" link in the Settings dropdown

// Following are Message List navigation options in the Settings dropdown
const MESSAGE_LIST_INBOX_LINK = '._1enh ._36ic ._30yy';
const MESSAGE_LIST_ACTIVE_CONTACTS_LINK  = '._54ni.__MenuItem:nth-child(3)';
const MESSAGE_LIST_MESSAGE_REQUESTS_LINK = '._54ni.__MenuItem:nth-child(4)';
const MESSAGE_LIST_ARCHIVED_THREADS_LINK = '._54ni.__MenuItem:nth-child(5)';

// Conversation dropdown
const CONVERSATION_DROPDOWN_LINK_SUFFIX = '._5blh';
const CONVERSATION_DROPDOWN = '._54nf';
const CONVERSATION_DROPDOWN_ITEM_LINK_PREFIX = '._54ni.__MenuItem';

const MUTE_CONVERSATION_LINK_INDEX                 = 1;
const ARCHIVE_CONVERSATION_LINK_INDEX              = 3;
const DELETE_CONVERSATION_LINK_INDEX               = 4;
const MARK_CONVERSATION_UNREAD_LINK_INDEX          = 6;
const MARK_CONVERSATION_SPAM_LINK_INDEX            = 7;
const REPORT_CONVERSATION_SPAM_OR_ABUSE_LINK_INDEX = 8;

const MUTE_GROUP_CONVERSATION_LINK_INDEX                 = 1;
const ARCHIVE_GROUP_CONVERSATION_LINK_INDEX              = 4;
const DELETE_GROUP_CONVERSATION_LINK_INDEX               = 5;
const MARK_GROUP_CONVERSATION_UNREAD_LINK_INDEX          = 7;
const MARK_GROUP_CONVERSATION_SPAM_LINK_INDEX            = 8;
const REPORT_GROUP_CONVERSATION_SPAM_OR_ABUSE_LINK_INDEX = 9;

// Conversation actions
const LIKE_CONVERSATION_LINK = '._4rv9._30yy._39bl';

let lastDockCount = null;
let textSelection = {};

// Hijack WebView notifications and create our own
window.Notification = (notification => {
	const EmptyNotification = function (rawTitle, options) {
		const rawBody = options.body;
		const title = (typeof rawTitle === 'object' && rawTitle.props) ? rawTitle.props.content[0] : rawTitle;
		const body = rawBody.props ? rawBody.props.content[0] : rawBody;
		const icon = options.icon;
		
		const image = new Image();
		image.crossOrigin = 'anonymous';
		image.src = icon;

		image.addEventListener('load', () => {
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			
			const context = canvas.getContext('2d');
			context.drawImage(image, 0, 0, image.width, image.height);

			const imageName = icon.substring(icon.lastIndexOf('/') + 1, icon.indexOf('?'));

			ipcRenderer.send(
				constants.NEW_MESSAGE_NOTIFICATION, 
				{
					notifParams: {
						title,
						body: body,
						silent: options.silent,
					},
					iconDataUrl: canvas.toDataURL(),
					imageName,
				}
			);
		});

		return false;
	};
	
	return Object.assign(EmptyNotification, notification);

})(window.Notification);

function bindKeyboardShortcuts() {
	// Main menu
	// - Show Settings
	ipcRenderer.on(constants.SHOW_SETTINGS, () => {
		document.querySelector(SETTINGS_LINK).click();
	});

	// File menu
	// - New Conversation
	ipcRenderer.on(constants.NEW_CONVERSATION, () => {
		document.querySelector(NEW_MESSAGE_BUTTON).click();
	});
	
	// View menu
	// - Inbox
	ipcRenderer.on(constants.SHOW_MESSAGE_LIST_INBOX, () => {
		resetMessageListToInbox();
	});
	
	// - Active contacts
	ipcRenderer.on(constants.SHOW_MESSAGE_LIST_ACTIVE_CONTACTS, () => {
		openMessageList(MESSAGE_LIST_ACTIVE_CONTACTS_LINK);
	});
	
	// - Message requests
	ipcRenderer.on(constants.SHOW_MESSAGE_LIST_MESSAGE_REQUESTS, () => {
		openMessageList(MESSAGE_LIST_MESSAGE_REQUESTS_LINK);
	});
	
	// - Archived threads
	ipcRenderer.on(constants.SHOW_MESSAGE_LIST_ARCHIVED_THREADS, () => {
		openMessageList(MESSAGE_LIST_ARCHIVED_THREADS_LINK);
	});
	
	function openMessageList(messageListLink) {
		resetMessageListToInbox();
		document.querySelector(messageListLink).click();
	}
	
	// Conversation menu
	// - Mute conversation
	ipcRenderer.on(constants.MUTE_CONVERSATION, () => {
		conversationAction(MUTE_CONVERSATION_LINK_INDEX, MUTE_GROUP_CONVERSATION_LINK_INDEX);
	});
	
	// - Archive conversation
	ipcRenderer.on(constants.ARCHIVE_CONVERSATION, () => {
		conversationAction(ARCHIVE_CONVERSATION_LINK_INDEX, ARCHIVE_GROUP_CONVERSATION_LINK_INDEX);
	});

	// - Delete conversation
	ipcRenderer.on(constants.DELETE_CONVERSATION, () => {
		conversationAction(DELETE_CONVERSATION_LINK_INDEX, DELETE_GROUP_CONVERSATION_LINK_INDEX);
	});

	// - Mark read / unread conversation
	ipcRenderer.on(constants.MARK_CONVERSATION_UNREAD, () => {
		conversationAction(MARK_CONVERSATION_UNREAD_LINK_INDEX, MARK_GROUP_CONVERSATION_UNREAD_LINK_INDEX);
	});

	// - Mark spam conversation
	ipcRenderer.on(constants.MARK_CONVERSATION_SPAM, () => {
		conversationAction(MARK_CONVERSATION_SPAM_LINK_INDEX, MARK_GROUP_CONVERSATION_SPAM_LINK_INDEX);
	});

	// - Report conversation
	ipcRenderer.on(constants.REPORT_CONVERSATION_SPAM_OR_ABUSE, () => {
		conversationAction(REPORT_CONVERSATION_SPAM_OR_ABUSE_LINK_INDEX, 
			REPORT_GROUP_CONVERSATION_SPAM_OR_ABUSE_LINK_INDEX);
	});

	function conversationAction(index, groupIndex) {
		const conversationMenuLink = document.querySelector(`${SELECTED_CONVERSATION} ${CONVERSATION_DROPDOWN_LINK_SUFFIX}`);
		if (!conversationMenuLink) {
			return;
		}
		conversationMenuLink.click();

		// There could be multiple menus displaying - pick the correct one
		document.querySelectorAll(CONVERSATION_DROPDOWN).forEach(menu => {
			const menuItemStrings = Array.from(menu.querySelectorAll(`${CONVERSATION_DROPDOWN_ITEM_LINK_PREFIX}`))
				.map(elem => { return elem.textContent; });

			const foundConversationMenu = menuItemStrings.includes('Mute') || menuItemStrings.includes('Unmute');
			if (!foundConversationMenu) {
				return;
			}

			const rootMenuElem = menu.parentElement.parentElement.parentElement;
			if (rootMenuElem) {
				// Hide menu before displaying. Note, don't need to un-hide 
				// after clicked as menu disappears after clicking
				rootMenuElem.style.visibility = 'hidden';
			}

			const isGroupConversation = menuItemStrings.includes('Leave Group');
			if (isGroupConversation) {
				const elem = menu.querySelector(`${CONVERSATION_DROPDOWN_ITEM_LINK_PREFIX}:nth-child(${groupIndex})`);
				if (elem) {
					elem.click();
				}
				return;
			}

			const elem = menu.querySelector(`${CONVERSATION_DROPDOWN_ITEM_LINK_PREFIX}:nth-child(${index})`);
			if (elem) {
				elem.click();
			}
		});
	}
	
	// Window menu
	// - Select next Conversation
	ipcRenderer.on(constants.NEXT_CONVERSATION, () => {
		const nextConversation = document.querySelector(SELECTED_CONVERSATION).nextSibling;
		if (nextConversation) {
			nextConversation.querySelector(ACTIVATE_CONVERSATION).click();
		}
	});
	
	// - Select previous Conversation
	ipcRenderer.on(constants.PREV_CONVERSATION, () => {
		const nextConversation = document.querySelector(SELECTED_CONVERSATION).previousSibling;
		if (nextConversation) {
			nextConversation.querySelector(ACTIVATE_CONVERSATION).click();
		}
	});

	// Touchbar
	// - Like conversation
	ipcRenderer.on(constants.LIKE_CONVERSATION, () => {
		const like = document.querySelector(LIKE_CONVERSATION_LINK);
		if (like) {
			const mouseDown = document.createEvent('MouseEvents');
			mouseDown.initEvent('mousedown', true, true);
			like.dispatchEvent(mouseDown);

			const mouseUp = document.createEvent('MouseEvents');
			mouseUp.initEvent('mouseup', true, true);
			like.dispatchEvent(mouseUp);
		}
	});
}

function resetMessageListToInbox() {
	const activeContactsLink = document.querySelector(MESSAGE_LIST_ACTIVE_CONTACTS_LINK);
	if (activeContactsLink) {
		// If the Active Contacts link visible, Inbox is already showing
		return;
	}

	const messageListInbox = document.querySelector(MESSAGE_LIST_INBOX_LINK);
	if (messageListInbox) {
		messageListInbox.click();
	}

	resetSettingsDropdown();
}

/**
 * Opens and closes the Settings dropdown so it's inserted into the DOM (so we 
 * can get those link elements and activate them)
 */
function resetSettingsDropdown() {
	const button = document.querySelector(SETTINGS_BUTTON);
	if (button) {
		button.click();
		button.click();  // clicking again to hide
	}
}

function bindLoadMessageIPCMessages() {
	ipcRenderer.on(constants.JUMP_TO_CONVERSATION, (event, id) => {
		const conversation = document.querySelector(`[id='${id}'] a`);
		if (conversation) {
			conversation.click();
		}
	});
	
	ipcRenderer.on(constants.JUMP_TO_CONVERSATION_BY_IMAGE_NAME, (event, imageName) => {
		const conversation = document.querySelector(`div[role="navigation"] > div > ul img[src*="${imageName}"]`);
		if (conversation) {
			conversation.click();
		}
	});
}

function bindDock() {
	document.addEventListener('DOMContentLoaded', () => {
		const titleObserver = new MutationObserver(mutations => {
			// dock count
			if (mutations.length <= 0) {
				return;
			}
			const title = mutations[0].target.text;
			if (title.indexOf('messaged you') != -1) {
				// Is flashing between "(1) Messenger" and "x messaged you", 
				// do nothing when in "x messaged you"
				return;
			}
			
			if (!title.startsWith('(')) {
				ipcRenderer.send(constants.DOCK_COUNT, 0);
				return;
			}
			
			const currentDockCount = parseInt(title.substr(1, (title.lastIndexOf(')') - 1))) || 0;
			ipcRenderer.send(constants.DOCK_COUNT, currentDockCount);
			if (lastDockCount === null) {
				lastDockCount = currentDockCount;
			}
			if (lastDockCount === currentDockCount) {
				return;
			}
		});
		titleObserver.observe(
			document.querySelector('title'), 
			{
				characterData: true,
				subtree: true,
				childList: true,
			}
		);
	});
}

function bindSpellChecking() {
	resetTextSelection();

	window.addEventListener('mousedown', resetTextSelection);
	
	webFrame.setSpellCheckProvider(
		'en-US',
		true,
		new SpellCheckProvider('en-US').on('misspelling', function(suggestions) {
		// Prime the context menu with spelling suggestions _if_ the user has selected text. Electron
		// may sometimes re-run the spell-check provider for an outdated selection e.g. if the user
		// right-clicks some misspelled text and then an image.
			if (window.getSelection().toString()) {
				textSelection.isMisspelled = true;
				textSelection.spellingSuggestions = suggestions.slice(0, 5);
			}
		})
	);
	
	window.addEventListener('contextmenu', function(e) {
		if (!e.target.closest('textarea, input, [contenteditable="true"]')) {
			return;
		}
		
		// The 'contextmenu' event is emitted after 'selectionchange' has fired but possibly before the
		// visible selection has changed. Try to wait to show the menu until after that, otherwise the
		// visible selection will update after the menu dismisses and look weird.
		setTimeout(function() {
			const menu = buildEditorContextMenu(textSelection);
			menu.popup(remote.getCurrentWindow());
		}, 30);
	});
}

function resetTextSelection() {
	textSelection = {
		isMisspelled: false,
		spellingSuggestions: [],
	};
}

bindKeyboardShortcuts();
bindLoadMessageIPCMessages();
bindDock();
bindSpellChecking();

document.addEventListener('DOMContentLoaded', () => {
	// load settings menu once, so it is inserted in the DOM
	setTimeout(
		() => { resetSettingsDropdown(); },
		1000
	);
});
