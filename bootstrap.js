const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
var Zotero;
var oldProcessor;

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

function monkeypatchIntegration (Zotero) {
    ////////////////////////////////////////////////////////////////////////////
    // From: https://www.npmjs.com/package/monkeypatch
    //
    // npm install monkeypatch
    //
    //module.exports = function(obj, method, handler, context) {
    
    var propachi_npm_monkeypatch = function(obj, method, handler, context) {
        var original = obj[method];

        // Unpatch first if already patched.
        if (original.unpatch) {
            original = original.unpatch();
        }

        // Patch the function.
        obj[method] = function() {
            var ctx  = context || this;
            var args = [].slice.call(arguments);
            args.unshift(original.bind(ctx));
            return handler.apply(ctx, args);
        };

        // Provide "unpatch" function.
        obj[method].unpatch = function() {
            obj[method] = original;
            return original;
        };

        // Return the original.
        return original;
    };
    //
    // Examples:
    //
    // Patching a function
    //
    // Monkeypatch Date.now() 
    // propachi_npm_monkeypatch(Date, 'now', function(original) {
    //   // Round to 15-minute interval. 
    //   var ts = original();
    //   return ts - (ts % 900000);
    // });
    //
    // var timestamp = Date.now(); // returns a rounded timestamp
    //
    //
    // Patching an instance method
    //
    // Monkeypatch Date#getTime() 
    // monkeypatch(Date.prototype, 'getTime', function(original) {
    //   // Round to 15-minute interval. 
    //   var ts = original();
    //   return ts - (ts % 900000);
    // });
    //
    // var date      = new Date();
    // var timestamp = date.getTime(); // returns a rounded timestamp
    //
    //
    // Argument handling
    //
    // Monkeypatch Date#setTime() 
    // monkeypatch(Date.prototype, 'setTime', function(original, ts) {
    //   // Round to 15-minute interval. 
    //   ts = ts - (ts % 900000);
    //   // Call the original. 
    //   return original(ts);
    // });
    // 
    // var date = new Date();
    // date.setTime(date.getTime()); // set to a rounded timestamp
    //
    //
    // Unpatching
    // Monkeypatch Date.now() 
    // monkeypatch(Date, 'now', function() { return 143942400000; });
    //
    // console.log(Date.now()); // logs 143942400000 
    //
    // Date.now.unpatch();
    // 
    // console.log(Date.now()); // logs current time


    // Ideas: Instead of trying to patch the integration.js, how about
    // overriding style.processCitationCluster(citation, citationsPre,
    // citationsPost); to make it munge the resulting formatted citations
    // between it and Zotero.Integration.Session.prototype.formatCitation
    // ?
    //
    // Also need to munge the results from getting the bibliography, so
    // style.makeBibliography(); ... it's output is modified to remove
    // ommittedItems and to replace items with customBibliographyText, so
    // what happens if I modify it between style.makeBibliography and
    // Zotero.Integration.Session.prototype.getBibliography()? Ok, it's
    // itemsToRemove is an array of indices, so as long as I don't remove
    // any of them, it should work fine no matter what I do to the text of
    // each item.

    // Q: How to change it's outputFormat, and to prevent it from putting
    // that {\\rtf... around it?

    // If I monkeypatch style.setOutputFormat(outputFormat); then how can
    // I ensure that it only changes it in the context of integration.js,
    // and not globally for every use of the citeproc within Juris-M?
    //
    // I think I can monkeypatch only one instance...
    //
    // It is set in only two places:
    //
    // Zotero.Integration.Session.prototype.setData = function(data, resetStyle)
    // Zotero.Integration.Session.BibliographyEditInterface.prototype._update = function()
    // 


    propachi_npm_monkeypatch(Zotero.Integration.Session.prototype, 'setData', function(original, data, resetStyle) {
        //console.log("propachi-texmacs:propachi_npm_monkeypatch:Zotero.Integration.Session.prototype.setData")
        var oldStyle = (this.data && this.data.style ? this.data.style : false);
        var ret = original(data, resetStyle); // performs: this.data = data;, ensures that this.style exists, etc.
        var outputFormat, new_style, original_style;
        // Same conditions by which original() determines whether to reset the style, using same information.
        if(data.style.styleID && (!oldStyle || oldStyle.styleID != data.style.styleID || resetStyle)) {
            // After it's done, we re-set the style. It really is this.style, not this.data.style here.
            // It's also certain at this point that this.style exists and is a Zotero.Citeproc.CSL.Engine.
            // Above the call to original(...) above, it might not have. It may have been reset, or not.
            outputFormat = Zotero.Prefs.get("integration.outputFormat") || "bbl";
            this.style.setOutputFormat(outputFormat);
            // pro-actively monkeypatch it for good measure.
            original_style = this.style;
            if (! original_style.setOutputFormat_is_propachi_monkeypatched) {
                new_style = Object.create(this.style);
                new_style.setOutputFormat = function(ignored_was_outputFormat_hard_coded) {
                    //console.log("propachi-texmacs:propachi_npm_monkeypatch:Zotero.Integration.Session.prototype.setData:new_style.setOutputFormat")
                    var outputFormat = Zotero.Prefs.get("integration.outputFormat") || "bbl";
                    original_style.setOutputFormat(outputFormat);
                };
                new_style.setOutputFormat_is_propachi_monkeypatched = true;
                this.style = new_style;
            }
        }
        return ret;
    });


    propachi_npm_monkeypatch(Zotero.Integration.Session.BibliographyEditInterface.prototype, '_update', function(original) {
        //console.log("propachi-texmacs:propachi_npm_monkeypatch:Zotero.Integration.Session.BibliographyEditInterface.prototype._update")
        var ret, new_style;
        var original_style = this.session.style;
        if (! original_style.setOutputFormat_is_propachi_monkeypatched) {
            new_style = Object.create(this.session.style);
            new_style.setOutputFormat = function(ignored_was_outputFormat_hard_coded) {
                //console.log("propachi-texmacs:propachi_npm_monkeypatch:Zotero.Integration.Session.BibliographyEditInterface.prototype._update:new_style.setOutputFormat")
                var outputFormat = Zotero.Prefs.get("integration.outputFormat") || "bbl";
                original_style.setOutputFormat(outputFormat);
            };
            new_style.setOutputFormat_is_propachi_monkeypatched = true;
            this.session.style = new_style;
        }
        return original(); // calls on setOutputFormat internally.
    });

    // propachi_npm_monkeypatch(Zotero.Integration.Session.prototype, 'getBibliography', function(original) {
    //     //console.log("propachi-texmacs:propachi_npm_monkeypatch:Zotero.Integration.Session.prototype.getBibliography")
    //     var bib = original();
    //     if(bib) {
    //         var bibl, bibstart, outputFormat;
            
    //         outputFormat = Zotero.Prefs.get("integration.outputFormat") || "bbl";

    //         if (outputFormat === "bbl") {
    //             //
    //             // The number inside of the \begin{thebibliography}{9999} is a width
    //             // template, where maxoffset is number of characters. This will
    //             // convert one to the other, and replace the initial 9999 with what
    //             // will hopefully be the right width. Again, this must be done as a
    //             // post-process, since it's not until the entire bibliography is
    //             // completed that we know what maxoffset's value is.
    //             //
    //             var max, maxmax;
    //     	max = bib[0].maxoffset;
    //     	maxmax = Zotero.Prefs.get("integration.maxmaxOffset") || 16;
    //     	if (max > maxmax) max = maxmax;
    //             bibstart = bib[0].bibstart.replace(/@MAXOFFSET@/, max.as_string());
    //         }
    //     }
    //     return bib;
    // });
}


function monkeyUnpatchIntegration(Zotero) {
    Zotero.Integration.Session.prototype.setData.unpatch &&
        Zotero.Integration.Session.prototype.setData.unpatch();

    Zotero.Integration.Session.BibliographyEditInterface.prototype._update.unpatch &&
        Zotero.Integration.Session.BibliographyEditInterface.prototype._update.unpatch();

    Zotero.Integration.Session.prototype.formatCitation.unpatch &&
        Zotero.Integration.Session.prototype.formatCitation.unpatch();

    Zotero.Integration.Session.prototype.getBibliography.unpatch &&
        Zotero.Integration.Session.prototype.getBibliography.unpatch();
}



function UiObserver() {
    this.register();
}

UiObserver.prototype = {
    observe: function(subject, topic, data) {
        ifZotero(
            function (Zotero) {
                replaceProcessor(Zotero);
                monkeypatchIntegration(Zotero);
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
            monkeypatchIntegration(Zotero);
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
            monkeyUnpatchIntegration(Zotero);
        },
        null
    );
}

function install (data, reason) {}
function uninstall (data, reason) {}
