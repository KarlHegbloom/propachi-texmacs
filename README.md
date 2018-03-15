# `propachi-texmacs` #

This is a **_necessary_** component of the [`zotero-texmacs-integration`](https://github.com/KarlHegbloom/zotero-texmacs-integration) plugin for [TeXmacs](http://www.texmacs.org).

__Notice: I have not yet tested all of this with Zotero 5.0, since I use Juris-M 5.0 myself. Testing it in plain Zotero 5.0 is a todo item at this point. It won't hurt anything to try it, so if you feel like and and have success (or failure) please feel free to report that to me via the GitHub "issues" tracker. Thanks.__

It is an add-on for __Juris-M__ (and hopefully Zotero) that modifies Juris-M's (or Zotero's) LibreOffice integration to make it't output format compatible with TeXmacs.

This add-on is compatible with both my TeXmacs plugin as well as with the OpenOffice and Word plugins. This add-on no longer needs to be disabled or uninstalled in order for those other editor plugins to function as intended.

This add-on is primarily a *monkey patch* to the [Juris-M](https://juris-m.github.io) (or [Zotero](https://www.zotero.org)) reference manager, which runs as a standalone XUL application (based on the [Firefox](https://www.mozilla.org/en-US/firefox/products/) web browser). It replaces the `citeproc-js` inside of Juris-M / Zotero with one that has certain options enabled, and also has been extended with a new `outputFormat`, called “`tmzoterolatex`”.

The *monkey patch* also overrides some functions inside the Juris-M / Zotero `integration.js` in order to cause the integration to output in the new `tmzoterolatex` format instead of in `rtf` format when the TeXmacs plugin sets that in the document prefs. Additionally, it enables and injects via a *monkey patch*, a `variableWrapper()` function, which is used to wrap the first 4 to 6 characters of the first item in a reference citation with a hyperlink to the bibliography entry when a `zbibliography` exists in the document, and the first 4 to 6 characters of a bibliography entry with a hyperlink to the URL in that Zotero entry, if it has one. When one of the character combinations ffi ffl ff fi fl occurs such that it would be split if the hyperlink's displayed text was only 4 characters, the length of that displayed text is extended just enough to include the entire group, so that the TeXmacs typesetter can render it as a typographic ligature in fonts that support it.

Code inside of the TeXmacs plugin also adds a list of back-references from each bibliography entry back to the point in the document where the citation occurred. If a reference is cited more than once, then there's more than one back-reference shown, one for each point of citation within the document. This *monkey patch* plugin is necessary for that to work properly, since it is what provides the TeXmacs document with the necessary labels for the intra-document hyperlinks.
