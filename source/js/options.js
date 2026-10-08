// vim: set ts=2 sw=2 et
import "./lib/browser-polyfill.js";
import { getSettings, setSettings, saveToSync, migrateFromLocalStorage } from "./storage.js";

const ERROR_BACKGROUND_COLOR = '#ffbbbb';
const FADE_DELAY = 2000;

function getBrowserName() {
  // Credit to https://github.com/mozilla/webextension-polyfill/issues/55#issuecomment-329676034 since polyfill makes old "check if browser is defined impossible"
  if (browser.runtime.id === 'theoldreader@knyar') {
    return 'Mozilla';
  } else {
    return 'Chrome';
  }
}

async function save_options() {
  if (!validate_options()) return;

  const settings = {
    click_page: $('#click_page').val(),
    show_notifications: $('#show_notifications').prop('checked') ? 'yes' : 'no',
    notification_timeout: String(parseInt($('#notification_timeout').val())),
    force_http: $('#force_http').prop('checked') ? 'yes' : 'no',
    prefer_pinned_tab: $('#prefer_pinned_tab').prop('checked') ? 'yes' : 'no',
    refresh_interval: String(parseInt($('#refresh_interval').val())),
    use_sync: $('#use_sync').prop('checked') ? 'yes' : 'no',
    context_menu: $('#context_menu').prop('checked') ? 'yes' : 'no',
  };

  // The background script reacts to these changes (context menus, refresh schedule)
  await setSettings(settings);

  show_message({text: browser.i18n.getMessage('optionsSaved_success'), fade_in: true, fade_out: true});

  if (settings.use_sync != "no") {
    syncCallback(await saveToSync());
  }
}

function syncCallback(result) {
  if (result === true) {
    show_message({text: browser.i18n.getMessage('optionsSaved_successAndSync'), fade_in: true, fade_out: true});
  } else {
    show_message({text: browser.i18n.getMessage('optionsSaved_successButSyncRetry'), fade_in: true, red: true});
  }
}

function validate_options() {
  let errors = $();

  // First check required to filter non-numbers
  if ($('#notification_timeout').val() === "" || parseInt($('#notification_timeout').val()) < 0) {
    errors = errors.add($('#notification_timeout').closest('p'));
  }
  if ($('#refresh_interval').val() === "" || parseInt($('#refresh_interval').val()) < 5) {
    errors = errors.add($('#refresh_interval').closest('p'));
  }

  if (errors.length) {
    show_message({text: browser.i18n.getMessage('optionsValidation_correctInvalid'), red: true, fade_in: true, fade_out: true});
    errors.animate({ backgroundColor: ERROR_BACKGROUND_COLOR}, 'fast').delay(FADE_DELAY).animate({ backgroundColor: 'none'}, 'fast');
    return false;
  } else {
    return true;
  }
}

async function load_options() {
  const settings = await getSettings();

  $('#click_page').val(settings.click_page);
  $('#show_notifications').prop('checked', (settings.show_notifications == 'yes'));
  $('#prefer_pinned_tab').prop('checked', (settings.prefer_pinned_tab == 'yes'));
  $('#notification_timeout').val(settings.notification_timeout);
  $('#force_http').prop('checked', (settings.force_http == 'yes'));
  $('#refresh_interval').val(settings.refresh_interval);
  $('#use_sync').prop('checked', (settings.use_sync != 'no'));
  $('#context_menu').prop('checked', (settings.context_menu != 'no'));
  $('#notification_timeout').closest('.subitem').toggle(settings.show_notifications == 'yes');
}

async function onMessageOptions(request) {
  if (request.update) {
    await load_options();
    let syncServiceName;
    switch (getBrowserName()) {
      case 'Mozilla':
        syncServiceName = browser.i18n.getMessage('syncService_firefox_name');
        break;
      case 'Chrome':
      default:
        syncServiceName = browser.i18n.getMessage('syncService_chrome_name');
    }
    show_message({text: browser.i18n.getMessage('optionsUpdateFromSync', syncServiceName), fade_in: true, fade_out: true});
  }
}

// message is an object:
//   text ( string )
//   red ( optional boolean )
//   fade_in ( optional boolean )
//   fade_out ( optional boolean )
function show_message(message) {
  $('#message').finish().hide();
  $('#message').text(message.text);
  $('#message').toggleClass("red", message.red);
  $('#message').toggleClass("green", !message.red);

  if (message.fade_in) {
    $('#message').fadeIn('fast');
  } else {
    $('#message').show();
  }

  if (message.fade_out) {
    $('#message').delay(FADE_DELAY).fadeOut('fast');
  }
}

function openChromeSyncSettings(e) {
  // A simple link would not work, but browser.tabs sidesteps restrictions
  browser.tabs.create({url: "chrome://settings/syncSetup"});
  e.preventDefault();
}

function displaySyncSettingsLink() {
  switch (getBrowserName()) {
    case 'Mozilla':
      $('#open_sync_settings').text(browser.i18n.getMessage('syncService_firefox_name'));
      $('#open_sync_settings').attr('href', 'https://support.mozilla.org/kb/how-do-i-choose-what-information-sync-firefox');
      $('#open_sync_settings').addClass('extlink');
      break;
    case 'Chrome':
    default:
      $('#open_sync_settings').text(browser.i18n.getMessage('syncService_chrome_name'));
      $('#open_sync_settings').click(openChromeSyncSettings);
  }
}

function showReviewsLink() {
  switch (getBrowserName()) {
    case 'Mozilla':
      $('#reviewsLink').text(browser.i18n.getMessage('rateLink_firefox'));
      $('#reviewsLink').attr('href', 'https://addons.mozilla.org/addon/the-old-reader-notifier-webext/reviews');
      break;
    case 'Chrome':
    default:
      $('#reviewsLink').text(browser.i18n.getMessage('rateLink_chrome'));
      $('#reviewsLink').attr('href', 'https://chrome.google.com/webstore/detail/the-old-reader-notifier/flnadglecinohkbmdpeooblldjpaimpo/reviews');
  }
}

function toggleChangelog(e) {
  e.preventDefault();
  $(".container").not("#changelogContainer").toggleClass('invisible');
  $("#changelogContainer").toggleClass('invisible');
  $("#changelogLink").toggleClass('invisible');
  $("#changelogHideLink").toggleClass('invisible');
}

$(document).ready(async function() {
  // i18n
  for (let element of document.querySelectorAll('[data-i18n-id]')) {
    element.textContent = browser.i18n.getMessage(element.dataset.i18nId);
  }

  showReviewsLink();
  // Settings saved by versions <= 1.5.3 in localStorage; the Chrome service
  // worker cannot read them, but this page can.
  await migrateFromLocalStorage();
  await load_options();

  fetch('ChangeLog').then(function(response) {
    return response.text();
  }).then(function(text) {
    $("#changelogText").text(text);
  });

  $("#optionsContainer").show();

  $("#changelogLink").click(toggleChangelog);

  $("#changelogHideLink").click(toggleChangelog);

  // Bind click handlers
  $('#save_button').click(save_options);
  displaySyncSettingsLink();

  // Reminder to save from dirty state
  $('input,select').change(function() {
    show_message({text: browser.i18n.getMessage('saveButton_clickMessage'), red: true});
  });

  // Show/animate subitem
  $('#show_notifications').click(function() {
    if ($('#show_notifications').prop('checked')) {
      $('#notification_timeout').closest('.subitem').slideDown('fast');
    } else {
      $('#notification_timeout').closest('.subitem').slideUp('fast');
    }
  });

  browser.runtime.onMessage.addListener(onMessageOptions);
});
