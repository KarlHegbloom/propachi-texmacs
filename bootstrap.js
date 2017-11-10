/* jshint undef: true, unused: true, curly: false, eqeqeq: true */
/* globals Components: false, Services:false, CSL:false */
/* exported Zotero */

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
var Zotero;

var oldProcessor = false;
var installFlag = false;

var prefOutputFormat; // "integration.outputFormat"
var prefMaxMaxOffset; // "integration.maxmaxOffset"

var styleReset = false;

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

var installProcessor = function() {
    if (! oldProcessor) {
        Zotero = Cc['@zotero.org/Zotero;1']
            .getService(Ci.nsISupports)
            .wrappedJSObject;
        oldProcessor = Zotero.CiteProc.CSL;
        Cu.import('resource://gre/modules/Services.jsm');
        Services.scriptloader.loadSubScript('chrome://propachi-texmacs/content/citeproc.js', this, 'UTF-8');
        Zotero.CiteProc.CSL = CSL;
    }
}.bind(this);

// function safeStringify(obj, replacer, spaces, cycleReplacer) {
//     return JSON.stringify(obj, safeSerializer(replacer, cycleReplacer), spaces);
// }

// function safeSerializer(replacer, cycleReplacer) {
//     var stack = [], keys = [];

//     if (cycleReplacer === null)
//         cycleReplacer = function(key, value) {
//             if (stack[0] === value) { return '[Circular ~]'; }
//             return '[Circular ~.' + keys.slice(0, stack.indexOf(value)).join('.') + ']';
//         };

//     return function(key, value) {
//         if (stack.length > 0) {
//             var thisPos = stack.indexOf(this);
//             ~thisPos ? stack.splice(thisPos + 1) : stack.push(this);
//             ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key);
//             if (~stack.indexOf(value)) value = cycleReplacer.call(this, key, value);
//         }
//         else stack.push(value);

//         return replacer === null ? value : replacer.call(this, key, value);
//     };
// }


function monkeyPatchIntegration() {
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
    //
    //------------------------------------------------------------


    //
    // Copied from integration.js to put them in scope here.
    //

    // Commonly used imports accessible anywhere
    Components.utils.import('resource://zotero/config.js');
    Components.utils.import('resource://zotero/q.js');
    Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
    Components.utils.import('resource://gre/modules/Services.jsm');

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


    /**
     * Copied and modified from:
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
    Zotero.Integration.Document.prototype.affirmCitation = function() {
        // console.log("Zotero.Integration.Document.prototype.affirmCitation() called.");
        var me = this;
        return this._getSession(true, false).then(function () {
            var field = me._doc.cursorInField(me._session.data.prefs['fieldType']);
            if(!field) {
                throw new Zotero.Exception.Alert("integration.error.notInCitation", [],
                                                 "integration.error.title");
            }
            return (new Zotero.Integration.Fields(me._session, me._doc)).affirmCitation(field);
        });
    };

    /*
     * Copied and modified from:
     *   Zotero.Integration.Fields.prototype.addEditCitation
     */
    Zotero.Integration.Fields.prototype.affirmCitation =
          Zotero.Promise.coroutine(function* (field) {
              var newField, citation, /* fieldIndex, */ code, session = this._session;

              // if there's already a citation, make sure we have item IDs in addition to keys
              if (field) {
                  try {
                      code = field.getCode();
                  } catch(e) {}

                  if(code) {
                      var [type, content] = this.getCodeTypeAndContent(code);
                      if(type !== INTEGRATION_TYPE_ITEM) {
                          throw new Zotero.Exception.Alert("integration.error.notInCitation");
                      }

                      try {
                          citation = session.unserializeCitation(content);
                      } catch(e) {}

                      if(citation) {
                          try {
                              yield session.lookupItems(citation);
                          } catch(e) {
                              if(e instanceof Zotero.Integration.MissingItemException) {
                                  citation.citationItems = [];
                              } else {
                                  throw e;
                              }
                          }

                          if(citation.properties.dontUpdate ||
                             (citation.properties.plainCitation &&
                              field.getText() !== citation.properties.plainCitation)) {
                              this._doc.activate();
                              Zotero.debug("[addEditCitation] Attempting to update manually modified citation.\n" +
                                           "citation.properties.dontUpdate: " + citation.properties.dontUpdate + "\n" +
                                           "Original: " + citation.properties.plainCitation + "\n" +
                                           "Current:  " + field.getText());
                              if(!this._doc.displayAlert(Zotero.getString("integration.citationChanged.edit"),
                                                         DIALOG_ICON_WARNING, DIALOG_BUTTONS_OK_CANCEL)) {
                                  throw new Zotero.Exception.UserCancelled("editing citation");
                              }
                          }

                          // make sure it's going to get updated
                          delete citation.properties.formattedCitation;
                          delete citation.properties.plainCitation;
                          delete citation.properties.dontUpdate;
                      }
                  }
              } else {
                  // For affirmCitation it makes no sense for there to *not* be
                  // a citation, where in addEditCitation it does make sense.
                  // newField = true;
                  // field = this.addField(true);
                  throw new Zotero.Exception.Alert("integration.error.notInCitation");
              }

              var me = this;
              return Zotero.Promise.resolve(field).then(function (field) {
                  if(!citation) {
                      field.setCode("TEMP");
                      citation = {"citationItems":[], "properties":{}};
                  }

                  var io = new Zotero.Integration.CitationEditInterface(citation, field, me, session);

                  // affirmCitation does not need to present the dialog like addEditCitation did:
                  //
                  // if(Zotero.Prefs.get("integration.useClassicAddCitationDialog")) {
                  //     Zotero.Integration.displayDialog(me._doc,
                  //     'chrome://zotero/content/integration/addCitationDialog.xul', 'alwaysRaised,resizable',
                  //     io);
                  // } else {
                  //     var mode = (!Zotero.isMac && Zotero.Prefs.get('integration.keepAddCitationDialogRaised')
                  //         ? 'popup' : 'alwaysRaised')+',resizable=false';
                  //     Zotero.Integration.displayDialog(me._doc,
                  //     'chrome://zotero/content/integration/quickFormat.xul', mode, io);
                  // }
                  //

                  io.accept(function (pct) {
                      // do-nothing progress callback for affirmCitation...
                  });

                  if(newField) {
                      return io.promise.catch(function (e) {
                          // Try to delete new field on failure
                          try {
                              field.delete();
                          } catch (e) {}
                          throw e;
                      });
                  } else {
                      return io.promise;
                  }
              });
          });

    //
    // Instead of having to monkey patch the setOutputFormat thing like this, I
    // think we should make the out-of-the-box one support the
    // integration.outputFormat pref setting, making the argument optional, and
    // then make integration.js respect the setting of that pref setting, to
    // make it outputFormat agnostic.
    //
    // Another thing that can help with that would be to make it so that there
    // can be separate functions run at certain points within integration.js
    // that are outputFormat dependant, to eliminate the need for long if then
    // switches and having to edit or monkeypatch integration.js to add support
    // for a new outputFormat.
    //
    // With an outputFormat agnostic integration.js, support for other editors
    // becomes possible, as demonstrated by this zotero-texmacs-integration. An
    // HTML or Markdown editor could just as easily utilize Juris-M / Zotero if
    // is possible to set the outputFormat and then use the same integration
    // wire protocol.
    //
    // In case somebody wants to edit a document in OpenOffice, and at the same
    // time, edit one in TeXmacs, that outputFormat will need to be associated
    // with each DocumentData... or editor integration plugin requested
    // outputFormat, and thus each Session... It should not be necessary to
    // edit the integration.js to plug in a new editor and outputFormat.
    //
    // Obviously a settings interface to changing the outputFormat isn’t what
    // this calls for. That setting must be a property set up during the
    // initiation of the integration command in play, just as the DocumentData
    // etc. is now.
    //
    propachiNpmMonkeypatch(Zotero.Integration.Session.prototype, 'setData', Zotero.Promise.coroutine(function *(original, data, resetStyle) {
        // data is a Zotero.Integration.DocumentData
        // this.style here is a citeproc...
        var oldStyle = (this.data && this.data.style ? this.data.style : false);
        var ret = original(data, resetStyle); // performs: this.data = data;, ensures that this.style exists, etc.
        var outputFormat, newStyle, originalStyle;
        // Same conditions by which original() determines whether to reset the style, using same information.
        if(data.style.styleID && (!oldStyle || oldStyle.styleID != data.style.styleID || resetStyle)) {
            // After it's done, we re-set the style. It really is this.style, not this.data.style here.
            // It's also certain at this point that this.style exists and is a Zotero.Citeproc.CSL.Engine.
            // Above the call to original(...) above, it might not have. It may have been reset, or not.
            outputFormat = Zotero.Prefs.get('integration.outputFormat') || 'tmzoterolatex';
            this.style.setOutputFormat(outputFormat);
            // pro-actively monkeypatch it for good measure.
            originalStyle = this.style;
            if (! originalStyle.setOutputFormat_is_propachi_monkeypatched) {
                newStyle = Object.create(this.style);
                newStyle.setOutputFormat = function(ignored_was_outputFormat_hard_coded) {
                    var outputFormat = Zotero.Prefs.get('integration.outputFormat') || 'tmzoterolatex';
                    originalStyle.setOutputFormat(outputFormat);
                };
                newStyle.setOutputFormat_is_propachi_monkeypatched = true;
                this.style = newStyle;
            }
            styleReset = true; // for variableWrapper, below.
        }
        return ret;
    } ) );


    // propachi_npm_monkeypatch(Zotero.Integration.Session.prototype, '_updateCitations', function(original) {
    //     var XRegExp = Zotero.Utilities.XRegExp;
    //     for each(var indexList in [this.newIndices, this.updateIndices]) {
    //         for(var index in indexList) {
    //                     var indexstr = index;
    //             index = parseInt(index);
    //             var citation = this.citationsByIndex[index];
    //                     console.log("_updateCitations:index:" + indexstr + ":citation before:" + safe_stringify(citation, null, 2));
    //                     var field, formattedCitation;
    //                     if (citation.properties && citation.properties.field) {
    //                         field = JSON.parse(citation.properties.field);
    //                         console.log("_updateCitations:got field:" + safe_stringify(field, null, 2) + "\n");
    //                     }
    //                     if (citation.properties && citation.properties.formattedCitation) {
    //                         formattedCitation = citation.properties.formattedCitation;
    //                     }
    //                     else if (field && field.properties && field.properties.formattedCitation) {
    //                         formattedCitation = field.properties.formattedCitation;
    //                     }
    //                     if (formattedCitation) {
    //                         console.log("_updateCitations:formattedCitation before XRegExp.replaceEach:\n" + formattedCitation + "\n");
    //                         formattedCitation = XRegExp.replaceEach(formattedCitation, [
    //                             [XRegExp('((?:[0-9][0-9A-Za-z.-]*#@)+)', 'g'), ''],
    //                             [XRegExp('((.*?)\\2X-X-X)', 'g'), ''],   // 'repeatrepeatX-X-X' ==> ''
    //                             [XRegExp('(X-X-X[  ]?)', 'g'), ''],
    //                             [XRegExp('([  ]?\\([  ]*\\))', 'g'), ''], // empty paren and space before ==> ''
    //                             [XRegExp('(.*000000000@#(.ztbib[A-Za-z]+.*})}.*\\.?}%?)', 'gm'), "$2"]
    //                         ]);
    //                         console.log("_updateCitations:formattedCitation after XRegExp.replaceEach:\n" + formattedCitation + "\n");
    //                         if (field && field.properties) {
    //                             field.properties.formattedCitation = formattedCitation;
    //                             citation.properties.field = JSON.stringify(field, null, 0);
    //                         }
    //                         if (citation.properties && citation.properties.formattedCitation) {
    //                             citation.properties.formattedCitation = formattedCitation;
    //                         }
    //                     }
    //                     console.log("_updateCitations:index:" + indexstr + ":citation after:" + safe_stringify(citation, null, 2));
    //         }
    //     }
    //     return original();
    // });


    ////
    //
    // The ultimate would be to have a TeXmacs widget there to display
    // these... But eventually I will also want them in HTML, at the same time,
    // so that the if-html thing will work right. I want the HTML that is
    // output by translating a TeXmacs document into an =.html= file to be CSS
    // and XPATH compatible with the standard Juris-M / Zotero / citeproc-js
    // HTML output.
    //
    // If a generalized format would be useful, perhaps an xml would work well
    // for it? <i> for italics, <b> for bold, <sc> for small-caps, etc. around
    // the text inside, and it's easy enough to convert from that format to any
    // other?
    //
    propachiNpmMonkeypatch(Zotero.Integration.Session.BibliographyEditInterface.prototype, '_update', function(original) {
        var ret, newStyle;
        var originalStyle = this.session.style;
        if (! originalStyle.setOutputFormat_is_propachi_monkeypatched) {
            newStyle = Object.create(this.session.style);
            newStyle.setOutputFormat = function(ignored_was_outputFormat_hard_coded) {
                var outputFormat = Zotero.Prefs.get("integration.outputFormat") || "tmzoterolatex";
                originalStyle.setOutputFormat(outputFormat);
            };
            newStyle.setOutputFormat_is_propachi_monkeypatched = true;
            this.session.style = newStyle;
        }
        return original(); // calls on setOutputFormat internally.
    });


    ////
    //
    // setVariablewrapper is called from within:
    //
    //   ../../zotero/chrome/content/zotero/xpcom/style.js:Zotero.Style.prototype.getCiteProc
    //
    // ... which returns a Zotero.CiteProc.CSL.Engine
    //
    // It is called as sys.setVariableWrapper, where sys is a Zotero.Cite.System, defined within the definition of
    // Zotero.Cite.System.prototype, found at:
    //
    //   ../../zotero/chrome/content/zotero/xpcom/cite.js:Zotero.Cite.System.prototype
    //
    // The sys object is created in Zotero.Style.prototype.getCiteProc, which hands that sys object to
    // new Zotero.CiteProc.CSL.Engine()
    //
    propachiNpmMonkeypatch(Zotero.Cite.System.prototype, 'setVariableWrapper', function(original, setValue) {

        // console.log("setVariableWrapper called.\n");

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
                [XRegExp('(.(ztbib[A-Za-z]+)\\{!?(.*)})', 'gm'), "<div class=\"$2\">$3</div>"]
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
        };


        this.variableWrapper = function(params, prePunct, str, postPunct) {


            if (params.mode === "tmzoterolatex") {

                // console.log("variableWrapper:params:\n#+BEGIN_EXAMPLE json\n" + JSON.stringify(params) + "\n#+END_EXAMPLE json\n");

                var thisItemID = params.context + "_" + params.itemData.id.toString();

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
                    lastItemID = "";
                    styleReset = false;
                }

                if (thisItemID !== lastItemID) {
                    firstVariableName = params.variableNames[0];
                    doNotRunWrapper = false;
                }
                else if (thisItemID === lastItemID &&
                         firstVariableName === params.variableNames[0]) {
                    doNotRunWrapper = false;
                }
                else if (thisItemID === lastItemID &&
                         firstVariableName !== params.variableNames[0]) {
                    doNotRunWrapper = true;
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
        }
    });

    //-------------------------------------------------
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

    //     if (state) {

    //         console.log("Zotero.Cite.System.prototype.embedBibliographyEntry:state:\n"
    //                     + safe_stringify(state, null, 2) + "\n\n");

    //         console.log("Zotero.Cite.System.prototype.embedBibliographyEntry:state.registry:\n"
    //                     + safe_stringify(state.registry, null, 2) + "\n\n");

    //         console.log("Zotero.Cite.System.prototype.embedBibliographyEntry:state.registry.registry:\n"
    //                     + safe_stringify(state.registry.registry, null, 2) + "\n\n");

    //         console.log("Zotero.Cite.System.prototype.embedBibliographyEntry:state.registry.registry[item_id]:\n"
    //                     + safe_stringify(state.registry.registry[item_id], null, 2) + "\n\n");
    //     }

    //     return "STUBTeXLabel1,STUBTeXLabel2,STUBTeXLabel3";
    // });


} // monkeyPatchIntegration


function monkeyUnpatchIntegration() {

    Zotero.Integration.Session.prototype.setData.unpatch &&
          Zotero.Integration.Session.prototype.setData.unpatch();

    // Zotero.Integration.Session.prototype._updateCitations.unpatch &&
    //     Zotero.Integration.Session.prototype._updateCitations.unpatch();

    Zotero.Integration.Session.BibliographyEditInterface.prototype._update.unpatch &&
          Zotero.Integration.Session.BibliographyEditInterface.prototype._update.unpatch();

    Zotero.Cite.System.prototype.setVariableWrapper.unpatch &&
          Zotero.Cite.System.prototype.setVariableWrapper.unpatch();

    // Zotero.Cite.System.prototype.embedBibliographyEntry.unpatch &&
    //     Zotero.Cite.System.prototype.embedBibliographyEntry.unpatch();

    // Zotero.Integration.Document.prototype.editCitation.unpatch &&
    //     Zotero.Integration.Document.prototype.editCitation.unpatch();

} // monkeyUnpatchIntegration


function UiObserver() {
    this.register();
}

UiObserver.prototype = {
    observe: function(subject, topic, data) {
        ifZotero(
            function (Zotero) {
                replaceProcessor(Zotero);
                monkeyPatchIntegration(Zotero);
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
function startup(data, reason) {
    ifZotero(
        function(Zotero) {
            if (installFlag) {
                replaceProcessor(Zotero);
                monkeyPatchIntegration(Zotero);
            }
        },
        function(Zotero) {
            // If not, assume it will arrive by the end of UI startup
            uiObserver.register();
        }
    );
}

// shutdown() can be called:
//
//  When the extension is uninstalled, if it's currently enabled.
//
//  When the extension becomes disabled.
//
//  When the user quits the application, if the extension is enabled.
//
function shutdown(data, reason) {
    if (reason === APP_SHUTDOWN) {
        return;
    }
    uiObserver.unregister();
    ifZotero(
            function(Zotero) {
                monkeyUnpatchIntegration(Zotero);
                Zotero.CiteProc.CSL = oldProcessor;
                oldProcessor = false;
            },
        null
    );
}

// Your bootstrap script must include an install() function, which the
// application calls before the first call to startup() after the extension is
// installed, upgraded, or downgraded.
//
function install(data, reason) {}

// This function is called after the last call to shutdown() before a
// particular version of an extension is uninstalled.
//
function uninstall(data, reason) {}
