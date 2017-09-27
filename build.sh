#!/bin/bash

set -e

# Release-dance code goes here.

# Constants
PRODUCT="Propachi: CSL processor monkey-patch for Zotero (TeXmacs Support)"
IS_BETA="true"
FORK="propachi-texmacs"
BRANCH="propachi-texmacs-master"
CLIENT="propachi-texmacs"
VERSION_ROOT="1.1."

# propachi_monkey_patch_for_zotero_csl_processor_and_editor_integration_with_texmacs_support-1.1.113beta8-fx.xpi
SIGNED_STUB="propachi_monkey_patch_for_zotero_csl_processor_and_editor_integration_with_texmacs_support-"

# citeproc-js is a symlink to a git checkout containing my
# fork of the citeproc-js with appropriate patches applied.
#
function xx-fetch-latest-processor () {
    cd "${SCRIPT_DIR}"
    cd ../citeproc-js
    ./test.py -B
    cp citeproc.js "${SCRIPT_DIR}/chrome/content/citeproc.js"
    sed -si 's/this\.development_extensions\.main_title_from_short_title = false/this\.development_extensions\.main_title_from_short_title = true/' "${SCRIPT_DIR}/chrome/content/citeproc.js"
    sed -si 's/this\.development_extensions\.uppercase_subtitles = false/this\.development_extensions\.uppercase_subtitles = true/' "${SCRIPT_DIR}/chrome/content/citeproc.js"
    cd "${SCRIPT_DIR}"
}

# The integration.js is also in a git checkout containing my fork and
# branch of the Juris-M zotero code with my patches applied. The goal
# will be to have the changes become part of the upstream program, but
# for now, in order to avoid having people need to run from a git
# clone, I'll pull it here and monkey-patch it for them on top of the
# released versin of Juris-M. That way it's just a matter of
# installing a Firefox xpi package and they'll be able to start using
# the TeXmacs / Juris-M / Zotero integration.
#
# This must be maintained separately to avoid attempting to redefine
# constants.
#function xx-fetch-latest-integration-js () {
#    cd "${SCRIPT_DIR}"
#    cp -p ../zotero/chrome/content/zotero/xpcom/integration.js \
#       "${SCRIPT_DIR}/chrome/content/integration.js"
#}

function xx-read-version-from-processor-code () {
    PROCESSOR_VERSION=$(cat "chrome/content/citeproc.js" | grep "PROCESSOR_VERSION:" | sed -e "s/.*PROCESSOR_VERSION:[^0-9]*\([.0-9]\+\).*/\1/")
    echo PROCESSOR_VERSION:${PROCESSOR_VERSION}
    VERSION=${PROCESSOR_VERSION}
}

function xx-make-the-bundle () {
    find . -name '.hg' -prune -o \
        -name '.hgignore' -prune -o \
        -name '.gitmodules' -prune -o \
        -name '*~' -prune -o \
        -name '.git' -prune -o \
        -name 'attic' -prune -o \
        -name '.hgsub' -prune -o \
        -name '.hgsubstate' -prune -o \
        -name '*.bak' -prune -o \
        -name 'version' -prune -o \
        -name 'releases' -prune -o \
        -name 'sh-lib' -prune -o \
        -name 'build.sh' -prune -o \
        -print \
        | xargs zip "${XPI_FILE}" >> "${LOG_FILE}"
}

function build-the-plugin () {
	set-install-version
        # xx-fetch-latest-integration-js
        xx-fetch-latest-processor
        xx-read-version-from-processor-code
        xx-make-the-bundle
    }

. jm-sh/frontend.sh
