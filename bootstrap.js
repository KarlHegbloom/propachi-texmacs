/* jshint undef: true, unused: true, curly: false, eqeqeq: true */
/* globals Components:false, Services:false, CSL:false */
/* exported Zotero */

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
var Zotero;
var oldProcessor = false;
var installFlag  = false;

var prefOutputFormat; // "integration.outputFormat"
var prefMaxMaxOffset; // "integration.maxmaxOffset"

var styleReset = false;

// function safeStringify(obj, replacer, spaces, cycleReplacer) {
//     return JSON.stringify(obj, safeSerializer(replacer, cycleReplacer), spaces);
// }
//
// function safeSerializer(replacer, cycleReplacer) {
//     var stack = [], keys = [];
//
//     if (cycleReplacer === null)
//         cycleReplacer = function(key, value) {
//             if (stack[0] === value) { return '[Circular ~]'; }
//             return '[Circular ~.' + keys.slice(0, stack.indexOf(value)).join('.') + ']';
//         };
//
//     return function(key, value) {
//         if (stack.length > 0) {
//             var thisPos = stack.indexOf(this);
//             ~thisPos ? stack.splice(thisPos + 1) : stack.push(this);
//             ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key);
//             if (~stack.indexOf(value)) value = cycleReplacer.call(this, key, value);
//         }
//         else stack.push(value);
//
//         return replacer === null ? value : replacer.call(this, key, value);
//     };
// }


//
// From: https://www.npmjs.com/package/monkeypatch
//
//   npm install monkeypatch
//
var propachiNpmMonkeypatch = function(obj, method, handler, context) {
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

//------------------------------------------------------------
//
// Examples:
//
// Patching a function
//
// Monkeypatch Date.now()
//
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
//
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
//
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
//
// Monkeypatch Date.now()
//
// monkeypatch(Date, 'now', function() { return 143942400000; });
//
// console.log(Date.now()); // logs 143942400000
//
// Date.now.unpatch();
//
// console.log(Date.now()); // logs current time
//
//------------------------------------------------------------


var propachiUnpatch = [];

function monkeyPatchIntegration() {

    //
    // Copied from integration.js to put them in scope here.
    //

    const RESELECT_KEY_URI      = 1;
    const RESELECT_KEY_ITEM_KEY = 2;
    const RESELECT_KEY_ITEM_ID  = 3;

    const DATA_VERSION = 3;

    const INTEGRATION_TYPE_ITEM         = 1;
    const INTEGRATION_TYPE_BIBLIOGRAPHY = 2;
    const INTEGRATION_TYPE_TEMP         = 3;

    const FORCE_CITATIONS_FALSE      = 0;
    const FORCE_CITATIONS_REGENERATE = 1;
    const FORCE_CITATIONS_RESET_TEXT = 2;

    const DIALOG_ICON_STOP    = 0;
    const DIALOG_ICON_WARNING = 1;
    const DIALOG_ICON_CAUTION = 2;

    const DIALOG_BUTTONS_OK            = 0;
    const DIALOG_BUTTONS_OK_CANCEL     = 1;
    const DIALOG_BUTTONS_YES_NO        = 2;
    const DIALOG_BUTTONS_YES_NO_CANCEL = 3;

    const NOTE_FOOTNOTE = 1;
    const NOTE_ENDNOTE  = 2;

    // Update this pref
    if (Zotero.Prefs.get("integration.outputFormat") === "bbl") {
        Zotero.Prefs.set("integration.outputFormat", "tmzoterolatex");
    }

    propachiNpmMonkeypatch(Zotero.CiteProc.CSL.Engine.prototype, 'setOutputFormat', function(original, ignoredMode) {
        var outputFormatMode = Zotero.Prefs.get("integration.outputFormat") || "tmzoterolatex";
        this.opt.mode = outputFormatMode;
        this.fun.decorate = Zotero.CiteProc.CSL.Mode(outputFormatMode);
        if (!this.output[outputFormatMode]) {
            this.output[outputFormatMode] = {};
            this.output[outputFormatMode].tmp = {};
        }
    });
    propachiUnpatch.push(Zotero.CiteProc.CSL.Engine.prototype.setOutputFormat.unpatch);

    /**
     * Copied and modified from:
     *
     *   Zotero.Integration.Document.prototype.addEditCitation
     *
     * Affirms the citation at the cursor position.
     *
     *   It works exactly like addEditCitation except that there is no dialog
     *   presented for modifying the citation cluster being affirmed. This is
     *   used to get a retypeset citation cluster after editor-side modifications
     *   via cut and paste of sub-citations inside the citation cluster,
     *   etc. (See, e.g., tm-zotero.scm for clipboard-cut, etc.)
     *
     * @return {Promise}
     */
    Zotero.Integration.Interface.prototype.affirmCitation = Zotero.Promise.coroutine(function* () {
        // console.log("Zotero.Integration.Interface.prototype.affirmCitation()
        // called.");
        yield this._session.init(false, false);
        var docField = this._doc.cursorInField(this._session.data.prefs['fieldType']);
        if(!docField) {
            throw new Zotero.Exception.Alert("integration.error.notInCitation", [],
                                             "integration.error.title");
        }
        let [idx, field, citation] = yield this._session.fields.affirmCitation(docField);
        yield this._session.addCitation(idx, field.getNoteIndex(), citation);
        if (this._session.data.prefs.delayCitationUpdates) {
            return this._session.writeDelayedCitation(idx, field, citation);
        } else {
            return this._session.fields.updateDocument(FORCE_CITATIONS_FALSE, false, false);
        }
    });

    /*
     * Copied and modified from:
     *   Zotero.Integration.Fields.prototype.addEditCitation
     */
    Zotero.Integration.Fields.prototype.affirmCitation = Zotero.Promise.coroutine(function* (field) {
	      var newField;

	      if (field) {
		        field = Zotero.Integration.Field.loadExisting(field);

		        if (field.type != INTEGRATION_TYPE_ITEM) {
			          throw new Zotero.Exception.Alert("integration.error.notInCitation");
		        }
	      } else {
		        newField = true;
		        field = new Zotero.Integration.CitationField(yield this.addField(true));
		        field.clearCode();
	      }

	      var citation = new Zotero.Integration.Citation(field);
	      yield citation.prepareForEditing();

	      // -------------------
	      // Preparing stuff to pass into CitationEditInterface
	      var fieldIndexPromise = this.get().then(function(fields) {
		        for (var i=0, n=fields.length; i<n; i++) {
			          if (fields[i].equals(field._field)) {
				            // This is needed, because LibreOffice integration plugin caches the field code instead of asking
				            // the document every time when calling #getCode().
				            field._field = fields[i];
				            return i;
			          }
		        }
            return 0;
	      });

	      var citationsByItemIDPromise;
	      if (this._session.data.prefs.delayCitationUpdates) {
		        citationsByItemIDPromise = Zotero.Promise.resolve(this._session.citationsByItemID);
	      } else {
		        citationsByItemIDPromise = fieldIndexPromise.then(function() {
			          return this.updateSession(FORCE_CITATIONS_FALSE);
		        }.bind(this)).then(function() {
			          return this._session.citationsByItemID;
		        }.bind(this));
	      }

        var previewFn = Zotero.Promise.coroutine(function* (citation) {
            let idx = yield fieldIndexPromise;
            yield citationsByItemIDPromise;

		        var [citations, fieldToCitationIdxMapping, citationToFieldIdxMapping] = this._session.getCiteprocLists();
		        let citationsPre = citations.slice(0, fieldToCitationIdxMapping[idx]);
		        let citationsPost = citations.slice(fieldToCitationIdxMapping[idx]+1);
		        try {
			          return this._session.style.previewCitationCluster(citation, citationsPre, citationsPost, "rtf");
		        } catch(e) {
			          throw e;
		        }
	      }.bind(this));

	      var io = new Zotero.Integration.CitationEditInterface(
		        citation, this._session.style.opt.sort_citations,
		        fieldIndexPromise, citationsByItemIDPromise, previewFn, this._session.style
	      );

	      // Zotero.debug('Integration: Displaying citation dialogue');
	      // if (Zotero.Prefs.get("integration.useClassicAddCitationDialog")) {
		    //     Zotero.Integration.displayDialog('chrome://zotero/content/integration/addCitationDialog.xul',
			  //                                      'alwaysRaised,resizable', io);
	      // } else {
		    //     var mode = (!Zotero.isMac && Zotero.Prefs.get('integration.keepAddCitationDialogRaised')
			  //                 ? 'popup' : 'alwaysRaised')+',resizable=false';
		    //     Zotero.Integration.displayDialog('chrome://zotero/content/integration/quickFormat.xul',
			  //                                      mode, io);
	      // }

        io.accept(function (pct) {
           // do nothing 
        });

	      // -------------------
	      // io.promise resolves when the citation dialog is closed
	      this.progressCallback = yield io.promise;

	      if (!io.citation.citationItems.length) {
		        // Try to delete new field on cancel
		        if (newField) {
			          try {
				            yield field.delete();
			          } catch(e) {}
		        }
		        throw new Zotero.Exception.UserCancelled("inserting citation");
	      }

	      var fieldIndex = yield fieldIndexPromise;
	      this._session.updateIndices[fieldIndex] = true;
	      // Make sure session is updated
	      yield citationsByItemIDPromise;
	      return [fieldIndex, field, io.citation];
    });


    var last_itemID = "";
    var first_variableName = "";
    var do_not_run_wrapper = false;

    Zotero.Cite.System.prototype._variableWrapperCleanString = function(str, mode) {
        var XRegExp = Zotero.Utilities.XRegExp;
        // console.log("_variableWrapperCleanString:str before:\n'" + str + "'\n");
        str = XRegExp.replaceEach(str, [
            [XRegExp('((?:[0-9][0-9A-Za-z.-]*#@)+)',  'g'), ''], // Sort categorizer prefixes
            [XRegExp('((.*?)\\2X-X-X)',               'g'), ''], // 'repeatrepeatX-X-X' ==> ''
            [XRegExp('(X-X-X[  ]?)',                  'g'), ''], // X-X-X and maybe a space after ==> ''
            [XRegExp('([  ]?\\([  ]*\\))',            'g'), ''], // empty paren and space before ==> ''
            [XRegExp('(.*000000000@#)',               'g'), ''], // Sort prefix for category heading ==> ''
            // [XRegExp('(.(ztbib[A-Za-z]+)\\{!?(.*)})', 'gm'), "<div class=\"$2\">$3</div>"]
        ]);

        // console.log("_variableWrapperCleanString:str after first replaceEach:\n'" + str + "'\n");

        if (mode && mode === 'tmzoterolatex') {
            // console.log("_variableWrapperCleanString:mode: tmzoterolatex");
            str = XRegExp.replaceEach(str, [
                [XRegExp('(<(ztbib[A-Za-z]+)>(.*)</\\2>)', 'gm'), '\\' + "$2{$3}"]
            ]);
        }
        else if (mode && mode === 'html') {
            // console.log("_variableWrapperCleanString:mode: html");
            str = XRegExp.replaceEach(str, [
                [XRegExp('(<(ztbib[A-Za-z]+)>(.*)</\\2>)', 'gm'), "<div class=\"$2\">$3</div>"]
            ]);
        }
        else {
            // console.log("_variableWrapperCleanString:mode: UNKNOWN");
            str = XRegExp.replaceEach(str, [
                [XRegExp('(<(ztbib[A-Za-z]+)>(.*)</\\2>)', 'gm'), "$3"]
            ]);
        }

        // console.log("_variableWrapperCleanString:str after:\n'" + str + "'\n");

        return str;
    }; // function Zotero.Cite.System.prototype._variableWrapperCleanString()


    propachiNpmMonkeypatch(Zotero.Cite.System.prototype, 'setVariableWrapper', function(original, setValue) {
       // do nothing
    });
    propachiUnpatch.push(Zotero.Cite.System.prototype.setVariableWrapper.unpatch);


    Zotero.Cite.System.prototype.variableWrapper = function(params, prePunct, str, postPunct) {

        // console.log("variableWrapper() called... params.mode is " + params.mode);

        if (params.mode === "tmzoterolatex") {

            // console.log("variableWrapper:params:\n#+BEGIN_EXAMPLE json\n" + JSON.stringify(params) + "\n#+END_EXAMPLE json\n");

            var this_itemID = params.context + "_" + params.itemData.id.toString();

            // console.log("variableWrapper:last_itemID:" + last_itemID);
            // console.log("variableWrapper:this_itemID:" + this_itemID);
            // console.log("variableWrapper:first_variableName:" + first_variableName);
            // console.log("variableWrapper:variableNames[0]:" + params.variableNames[0]);

            // When I addCitation, and then the next operation is anything but an addCitation or editCitation for the
            // same citation itemData.id, then:
            //
            //   this_itemID !== last_itemID
            //
            // ... However, when I addCitation, and then immediately after that call editCitation on the same one, or
            // addCitation and add one with the same citation itemData.id as the last time this function was called,
            // then:
            //
            //   this_itemID === last_itemID
            //
            // ... but really I want the wrapper to be called when it's the first_variableName; that is, when it's the
            // start of a new citation or bibliography entry being formatted, whether it be a new citation containing as
            // it's first item the same itemData.id as the last one this function has seen, or an immediate editCitation
            // of one that was just added.
            //
            // This part of the program does not know in advance what CSL style is in use, thus it can not know in
            // advance which variable from the itemData will be formatted first.
            //
            // If the CSL style is changed, the first_variableName may be different than it was before, even if this
            // addCitation or editCitation is not for the same itemData.id as the last one. I assume that the style
            // won't get reset in the middle of outputing a citation or bibliography entry.
            //
            if (styleReset) {
                last_itemID = "";
                styleReset = false;
            }

            if (this_itemID !== last_itemID) {
                first_variableName = params.variableNames[0];
                do_not_run_wrapper = false;
            }
            else if (this_itemID === last_itemID &&
                     first_variableName === params.variableNames[0]) {
                do_not_run_wrapper = false;
            }
            else if (this_itemID === last_itemID &&
                     first_variableName !== params.variableNames[0]) {
                do_not_run_wrapper = true;
            }

            // This will only run most of this function's code for the first variable in a citation or bibliography
            // entry (e.g., the title or the author) so that the first 4 characters of the first word, no matter what
            // CSL format was chosen by the user, will become a hyperlink. Obviously we don't want every variable field
            // in a citation or bibliography entry to have a hyperlink; only the first.
            //
            if (do_not_run_wrapper) {
                return (prePunct + str + postPunct);
            } else {
                // Experimentally clean strings:
                str = this._variableWrapperCleanString(str, params.mode);
                //
                // The parsing below is necessary so that the right part gets wrapped with the URL. It has to find the
                // text-only part, and wrap the first 4 characters of that. I don't want it to wrap LaTeX macros, for
                // example. For some reason, some of them come through, as when a font shape or styling has been applied
                // to it. The other strings we need to skip are the 00#@ and 000000000@# hacks.
                //
                // console.log("variableWrapper:str:\n----\n" + str + "\n----\n");
                //
                // Sample str values from real documents:
                //
                // W.W. Thornton
                // V
                // {\itshape{}Coram Nobis Et Coram Vobis}
                // {\scshape{}Wikipedia}
                // {\scshape{}Ind. L.J.}
                // 02#@UtahUtahX-X-X
                //
                // \ztHref{http://en.wikipedia.org/w/index.php?title=Maxims\_of\_equity\&oldid=532918962}{http://en.wikipedia.org/w/index.php?title=Maxims\_of\_equity\&oldid=532918962}

                var fore, txt, aft;

                // I created this str_parse regexp by using the Firefox addon called "Regular Expression Tester", by
                // Sebo. I could not have done this without it.
                //
                var str_parse = new Zotero.Utilities.XRegExp(/^((?:[0-9][-0-9a-zA-Z.@#]+(?:#@|@#)|\{?\\[a-z][a-zA-Z0-9}{]+(?:\{}?))+)*([^\}]+)(\}?.*)$/);

                // check for typographic ligature and be sure to include all of the characters it's comprised of within
                // the display text of the link so that they are rendered properly in TeXmacs.
                //
                var ligrx = new Zotero.Utilities.XRegExp(/^(...?ff[il]|...f[fil])/);

                var m = Zotero.Utilities.XRegExp.exec(str, str_parse);
                if (m != null) {
                    // console.log("variableWrapper:m != null");
                    // console.log("variableWrapper:m:" + safe_stringify(m, null, 2));
                    // console.log("variableWrapper:m[0]:" + m[0]);
                    fore = (m[1] ? m[1] : '');
                    txt  = (m[2] ? m[2] : '');
                    aft  = (m[3] ? m[3] : '');
                } else {
                    // console.log("variableWrapper:m === null");
                    fore = '';
                    txt  = str;
                    aft  = '';
                }
                // console.log("variableWrapper:fore:" + fore);
                // console.log("variableWrapper:txt:"  + txt);
                // console.log("variableWrapper:aft:"  + aft + "\n");

                var URL = null;
                var DOI = params.itemData.DOI;
                if (DOI) {
                    URL = 'https://doi.org/' + Zotero.Utilities.cleanDOI(DOI);
                }
                if (!URL) {
                    URL = params.itemData.URL ? params.itemData.URL : params.itemData.URL_REAL;
                }
                last_itemID = this_itemID;
                // any first field for this_itemID When
                // this splits between characters of a
                // ligature, it breaks the ligature and
                // makes too wide a space there. It needs
                // to look for that, and just include both
                // letters of the ligature into the link
                // text. e.g., "Griffin"
                // ff fi fl ffi ffl
                if (params.context === "bibliography") {
                    if (URL) {
                        if (txt.length > 4) {
                            var txtend = 4;
                            m = Zotero.Utilities.XRegExp.exec(txt, ligrx);
                            if (m != null) {
                                txtend = m[0].length;
                            }
                            return prePunct
                                + fore
                                + '\\ztHrefFromBibToURL{#zbibSysID'
                                + params.itemData.id.toString()
                                +  '}{'
                                + '\\path{' + URL.replace(/([$_^{%&])/g, "\\$1") + '}'
                                + '}{'
                                + txt.substring(0,txtend)
                                + '}'
                                + txt.substring(txtend)
                                + aft
                                + postPunct;
                        } else {
                            return prePunct
                                + fore
                                + '\\ztHrefFromBibToURL{#zbibSysID'
                                + params.itemData.id.toString()
                                + '}{'
                                + '\\path{' + URL.replace(/([$_^{%&])/g, "\\$1") + '}'
                                + '}{'
                                + txt
                                + '}'
                                + aft
                                + postPunct;
                        }
                    } else {
                        return (prePunct + str + postPunct);
                    }
                    // any first field for an id
                } else if (params.context === 'citation') {
                    var theURL;
                    if (URL) {
                        // client Guile code and style package macros can use this to create a
                        // hyperlink to the on-line URL when there's no bibliography in the
                        // document. When there is one, then the ztHrefFromCiteToBib macro's
                        // first argument will link to a label loci inside the bibliography.
                        //
                        // There, in the bibliography, each item can have a link to this same
                        // URL; using the first four characters of the item's text as the
                        // display text.
                        //
                        theURL = '\\path{' + URL.replace(/([$_^{%&])/g, "\\$1") + '}';
                    } else {
                        theURL = '\\path{\\ztDefaultCiteURL}';
                    }
                    if (txt.length > 4) {
                        // Notice that the zbibSysID contains the item system id as assigned
                        // by Juris-M / Zotero. So these have enough information to program-
                        // atically form the zotero: URL that finds the citation.  This tag
                        // can look up the tree to find the citation cluster that it's in, and
                        // thus the zotero: URL's; perhaps in that cluster's field code data.
                        var txtend = 4;
                        m = Zotero.Utilities.XRegExp.exec(txt, ligrx);
                        if (m != null) {
                            txtend = m[0].length;
                        }
                        return prePunct
                            + fore
                            + '\\ztHrefFromCiteToBib{#zbibSysID'
                            + params.itemData.id.toString()
                            + '}{'
                            + theURL
                            + '}{'
                            + txt.substring(0,txtend)
                            + '}'
                            + txt.substring(txtend)
                            + aft
                            + postPunct;
                    } else {
                        return prePunct
                            + fore
                            + '\\ztHrefFromCiteToBib{#zbibSysID'
                            + params.itemData.id.toString()
                            + '}{'
                            + theURL
                            + '}{'
                            + str
                            + '}'
                            + aft
                            + postPunct;
                    }
                }
            }
        }
        else if (Zotero.Prefs.get('linkTitles')) {
            //
            // params.mode !== 'tmzoterolatex' &&
            // Zotero.Prefs.get('linkTitles') => true
            //                //
            // The following code was initially pasted directly from:
            //
            //    ../../zotero/chrome/content/zotero/xpcom/cite.js:Zotero.Cite.System.prototype.setVariableWrapper
            //
            //   Handles params.modes === 'html' || 'rtf'
            //

            if (params.variableNames[0] === 'title'
                && (params.itemData.URL || params.itemData.URL_REAL || params.itemData.DOI)
                && params.context === "bibliography") {

                // console.log("linkTitles, title, bibliography, with URL or DOI present.");

                var URL = null;
                var DOI = params.itemData.DOI;
                if (DOI) {
                    URL = 'https://doi.org/' + Zotero.Utilities.cleanDOI(DOI)
                }
                if (!URL) {
                    URL = params.itemData.URL ? params.itemData.URL : params.itemData.URL_REAL;
                }
                if (URL) {

                    str = this._variableWrapperCleanString(str, params.mode);

                    if (params.mode === 'rtf') {
                        return prePunct + '{\\field{\\*\\fldinst HYPERLINK "' + URL + '"}{\\fldrslt ' + str + '}}' + postPunct;
                    } else if (params.mode === 'html') {
                        return prePunct + '<a href="' + URL + '">' + str + '</a>' + postPunct;
                    }
                    // org-mode or markdown ?
                    else {
                        return (prePunct + str + postPunct);
                    }
                }
            }
        }
        // Fall-through default:
        str = this._variableWrapperCleanString(str, params.mode);
        return (prePunct + str + postPunct);
    }; // function Zotero.Cite.System.prototype.variableWrapper()


    //-------------------------------------------------
    //
    // TODO: Maybe this can be used to create the ztbibItemRefsList ?

    //
    // Test for this.item_id to add decorations to
    // bibliography output of individual entries.
    //
    // Full item content can be obtained from
    // state.registry.registry[id].ref, using
    // CSL variable keys.
    //
    // Example:
    //
    //   print(state.registry.registry[this.item_id].ref["title"]);
    //
    // At present, for parallel citations, only the
    // id of the master item is supplied on this.item_id.
    //
    //-------------------------------------------------------------
    //
    // this.item_id, state (from tmzoterolatex) this.item_id (from html)
    //
    //  "this" in that context is a CSL.Output.Formats
    //
    // An item_id is going to be an integer, from Zotero.
    //
    // propachi_npm_monkeypatch(Zotero.Cite.System.prototype, 'embedBibliographyEntry', function(original, item_id, state) {
    //     // state.registry.registry[item_id].ref is
    //
    //     if (state) {
    //
    //         console.log("Zotero.Cite.System.prototype.embedBibliographyEntry:state:\n"
    //                     + safe_stringify(state, null, 2) + "\n\n");
    //
    //         console.log("Zotero.Cite.System.prototype.embedBibliographyEntry:state.registry:\n"
    //                     + safe_stringify(state.registry, null, 2) + "\n\n");
    //
    //         console.log("Zotero.Cite.System.prototype.embedBibliographyEntry:state.registry.registry:\n"
    //                     + safe_stringify(state.registry.registry, null, 2) + "\n\n");
    //
    //         console.log("Zotero.Cite.System.prototype.embedBibliographyEntry:state.registry.registry[item_id]:\n"
    //                     + safe_stringify(state.registry.registry[item_id], null, 2) + "\n\n");
    //     }
    //
    //     return "STUBTeXLabel1,STUBTeXLabel2,STUBTeXLabel3";
    // });

}; // function monkeyPatchIntegration()


function monkeyUnpatchIntegration() {
    for(let unpatch in propachiUnpatch) {
        unpatch();
    }
}; // monkeyUnpatchIntegration


var installProcessor = function() {
    Zotero = Cc['@zotero.org/Zotero;1']
        .getService(Ci.nsISupports)
        .wrappedJSObject;
    oldProcessor = Zotero.CiteProc.CSL;
    Cu.import('resource://gre/modules/Services.jsm');
    Services.scriptloader.loadSubScript('chrome://propachi-texmacs/content/citeproc.js', this, 'UTF-8');
    Zotero.CiteProc.CSL = CSL;
}.bind(this);

var uiObserver = {
    observe: function(subject, topic, data) {
        installProcessor();
        monkeyPatchIntegration();
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
};

/*
 * Bootstrap functions
 */

// startup() can be called:
//
//  When the extension is first installed, assuming that it's both compatible
//  with the application and is enabled.
//
//  When the extension becomes enabled using the add-ons manager window.
//
//  When the application is started up, if the extension is enabled and
//  compatible with the application.
//
// Parameters
//  data
//      A bootstrap data structure.
//  reason
//      One of the reason constants, indicating why the extension is being
//      started up. This will be one of APP_STARTUP, ADDON_disable,
//      ADDON_INSTALL, ADDON_UPGRADE, or ADDON_DOWNGRADE.
//
function startup (data, reason) {
    if (installFlag) {
        installProcessor();
        monkeyPatchIntegration();
    } else {
        uiObserver.register();
    }
};

// shutdown() can be called:
//
//  When the extension is uninstalled, if it's currently enabled.
//
//  When the extension becomes disabled.
//
//  When the user quits the application, if the extension is enabled.
//
function shutdown (data, reason) {
    if (reason === APP_SHUTDOWN) {
        return;
    }
    if (installFlag) {
        monkeyUnpatchIntegration();
        Zotero.CiteProc.CSL = oldProcessor;
        installFlag = false;
    } else {
        uiObserver.unregister();
        monkeyUnpatchIntegration();
        Zotero.CiteProc.CSL = oldProcessor;
    }
};

// Your bootstrap script must include an install() function, which the
// application calls before the first call to startup() after the extension is
// installed, upgraded, or downgraded.
//
function install (data, reason) {
    installFlag = true;
};

// This function is called after the last call to shutdown() before a
// particular version of an extension is uninstalled.
//
function uninstall (data, reason) {};
