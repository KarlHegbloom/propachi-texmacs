const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
var Zotero;
var oldProcessor;
var oldIntegration;

var prefOutputFormat; // "integration.outputFormat"
var prefMaxMaxOffset; // "integration.maxmaxOffset"

/*
 * Zotero runs citeproc-js synchronously within an async thread. We
 * can retrieve modules synchronously inside citeproc-js, and the
 * additional I/O will not impact the UI. Whew.
 */

function ifZotero(succeed, fail) {
    var ZoteroClass = Cc["@zotero.org/Zotero;1"];
    if (ZoteroClass) {
        Zotero = ZoteroClass
	        .getService(Ci.nsISupports)
	        .wrappedJSObject;
        succeed ? succeed(Zotero) : null;
    } else {
        fail ? fail() : null;
    }
}

function replaceProcessor (Zotero) {
    oldProcessor = Zotero.CiteProc.CSL;
    Cu.import("resource://gre/modules/Services.jsm");
    Services.scriptloader.loadSubScript("chrome://propachi/content/citeproc.js", this, "UTF-8");
    Zotero.CiteProc.CSL = CSL;
}

function replaceIntegration (Zotero) {
    oldIntegration = Zotero.Integration;
    Cu.import("resource://gre/modules/Services.jsm");
    Services.scriptloader.loadSubScript("chrome://propachi/content/integration.js", this, "UTF-8");
    if(!Zotero.isConnector) {
        // Initially called in zotero.js from inside _initFull() at
        // the end of init() when not loading in connector mode. When
        // Zotero debugging is on, init() prints "Loading in full
        // mode" just before calling _initFull().
        //
        // This happens right after Zotero.Styles.preinit() is called,
        // and just before Zotero.Server.init() and Zotero.Sync.init().
        //
        // I think this should work fine because of (a) the low number
        // of references to Zotero.Integration from within the entire
        // Zotero program. It is well isolated and no references are
        // being created or kept around until after startup is done
        // and a program connects to the integration port, etc. (b)
        // Nothing initialized after the Zotero.Integration refers
        // back to it during the initialization process.
        Zotero.Integration.init();
        //
        prefOutputFormat = Zotero.Prefs.get("integration.outputFormat") || "bbl";
        Zotero.Prefs.set("integration.outputFormat", prefOutputFormat);
        prefMaxMaxOffset = Zotero.Prefs.get("integration.maxmaxOffset") || 16;
        Zotero.Prefs.set("integration.maxmaxOffset", prefMaxMaxOffset);
    }
}

function UiObserver() {
    this.register();
}

UiObserver.prototype = {
    observe: function(subject, topic, data) {
        ifZotero(
            function (Zotero) {
                replaceProcessor(Zotero);
                replaceIntegration(Zotero);
            },
            null
        );
    },
    register: function() {
        var observerService = Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService);
        observerService.addObserver(this, "final-ui-startup", false);
    },
    unregister: function() {
        var observerService = Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService);
        observerService.removeObserver(this, "final-ui-startup");
    }
}
var uiObserver = new UiObserver();


/*
 * Bootstrap functions
 */

function startup (data, reason) {
    ifZotero(
        function (Zotero) {
            // Set immediately if we have Zotero
            replaceProcessor(Zotero);
            replaceIntegration(Zotero);
        },
        function () {
            // If not, assume it will arrive by the end of UI startup
            uiObserver.register();
        }
    );
}

function shutdown (data, reason) {
    uiObserver.unregister();
    ifZotero(
        function (Zotero) {
            Zotero.CiteProc.CSL = oldProcessor;
            // Zotero.Prefs.clear("integration.outputFormat");
            // Zotero.Prefs.clear("integration.maxmaxOffset");
        },
        null
    );
}

function install (data, reason) {}
function uninstall (data, reason) {}
