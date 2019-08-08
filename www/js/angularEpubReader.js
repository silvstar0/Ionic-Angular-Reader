/**
 * Angular/Ionic ePub Reader Directive
 *
 * (c) Mark Watkins https://github.com/viking2917/angular-epub-reader
 * License: MIT
 *
 * @version: 1.0.0
 */

/* a directive for an ionic/angular v1 eReader for reading epub files. 
   leverages the epub.js component from future press.
   also leverages a heavily hacked up version of [Patrick G](https://github.com/geek1011)'s excellent [ePubViewer](https://github.com/geek1011/ePubViewer). 
   mistakes obviously are all mine.

   also introduces an annotation UI. The directive manages the integration with epub.js highlighting system, as well as providing an annotation UI. 
   major lifecycle events generate angular events, which an external application can watch for, for things such as serialization or coordination with UI states

   Usage: 
   Arguments:
      use-local-storage: { true | false } - whether to store reader actions in local storage and recover them on reload: eg. current page #, bookmarks, etc.
      src: {uri} - a uri to an epub file to load. 

   <epubreader 
      use-local-storage="false" 
      src="https://standardebooks.org/ebooks/rafael-sabatini/captain-blood/dist/rafael-sabatini_captain-blood.epub">
   </epubreader>
   
*/


/* paths not taken: (i.e. why did I build my own instead of using something out there:

   annotator.js: I couldn't get to work on mobile - in the 1.x version the touch plugin doesn't seem to work, 2.x branch seems dead and has no such plugin. 
     Neither branch has much activity, suggesting dead code. 
   hypothesis: cool product but I couldn't figure out how to untangle it for my purposes - I couldn't figure out the integration between the annotator and the reader, 
       and anyway seems very oriented towards open web content and public commentary, and a fully integrated reading ux, not a separate annotator. 
       My use case, books and social reading, I just couldn't figure out how to untangle it.
*/

angular.module('epubreader', [])
.directive('epubreader', function($ionicPopup, $ionicPopover, $ionicActionSheet, $ionicBody, $document, $window) {
    return {
	restrict: "E",
	scope: {
	    src: '@', 
	    useLocalStorage: '=',
	    // directivevariable: '=', 
	},

	templateUrl: 'templates/reader.html',

	controller: function($scope, $rootScope, $timeout, $location, $q, $sce){
	    
	    /* initialize variables */
	    console.log($scope.useLocalStorage);
	    $scope.state = {error : false, sidebar : false, activeTab : 'toc', bookmarks : [], highlights: []};

	    // $scope.platform = 'ios';
	    $scope.metadata = {};

	    /********************************************************************************/
	    /*                                 Reader Styling                               */
	    /********************************************************************************/

	    $scope.settings = {}; 
	    $scope.settings.themes = [
		{bg: "#fff", fg: "#000"}, {bg: "#000", fg: "#fff"}, {bg: "#333", fg: "#eee"}, {bg: "#f5deb3", fg: "#000"}, 
		{bg: "#111", fg: "#f5deb3"}, {bg: "#111b21", fg: "#e8e8e8"}
	    ];
	    $scope.settings.fontsizes = [8,9,10,11,12,14,16,18];
	    $scope.settings.lineSpacings = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.3, 2.6, 3];
	    $scope.settings.margins = [0,1,2,3,4,5,7,9,12,15];
	    $scope.settings.fonts = [
		{name: 'Arial', style: "'Arial', Arimo, Liberation Sans, sans-serif"}, 
		{name: 'Lato', style: "'Lato', sans-serif"},
		{name: 'George', style: "'Georgia', Liberation Serif, serif"},
		{name: 'Times New Roman', style: "'Times New Roman', Tinos, Liberation Serif, Times, serif"},
		{name: 'Spectral', style: "'Spectral', sans-serif"},
		{name: 'Libre Baskerville', style: "'Libre Baskerville', sans-serif"},
		{name: 'Merriweather', style: "'Merriweather', serif"}
	    ];
	    
	    $scope.theme = {
		bg: "#fff", fg: "#000",
		l: "#1e83d2", ff: "'Merriweather', 'Times New Roman', Tinos, Liberation Serif, Times, serif",
		fs: "11", lh: "1.6", ta: "justify", m: "5"
	    };

	    $scope.saveSettingsToStorage = function () {
		if($scope.useLocalStorage) localStorage.setItem(`ePubViewer:settings`, JSON.stringify($scope.theme));
		$rootScope.$broadcast('epubReaderSaveSettings', {
		    settings: JSON.stringify($scope.theme)
		});
		
	    };
	  
	    $scope.loadSettingsFromStorage = function () {
		if($scope.useLocalStorage) {
		    let restored = localStorage.getItem(`ePubViewer:settings`);
		    if((typeof restored !== 'undefined') && restored) {
			$scope.theme = JSON.parse(restored);
		    }
		}
		$scope.applyTheme();
	    };

	    $scope.applyTheme = function (toggleSidebar) {
		if(typeof toggleSidebar === 'object') toggleSidebar = false;  // epubviewer handler calls this with the content object. Don't show the sidebar in that case.

		try {
		    var rules = {
			"body": {
			    "background": $scope.theme.bg,
			    "color": $scope.theme.fg,
			    "font-family": $scope.theme.ff != "" ? `${$scope.theme.ff} !important` : "!invalid-hack",
			    "font-size": $scope.theme.fs != "" ? `${$scope.theme.fs}pt !important` : "!invalid-hack",
			    "line-height": `${$scope.theme.lh} !important`,
			    "text-align": `${$scope.theme.ta} !important`,
			    "padding-top": $scope.theme.m + 'px',
			    "padding-bottom": $scope.theme.m + 'px'
			},
			"p": {
			    "font-family": $scope.theme.ff != "" ? `${$scope.theme.ff} !important` : "!invalid-hack",
			    "font-size": $scope.theme.fs != "" ? `${$scope.theme.fs}pt !important` : "!invalid-hack",
			},
			"a": {
			    "color": "inherit !important",
			    "text-decoration": "none !important",
			    "-webkit-text-fill-color": "inherit !important"
			},
			"a:link": {
			    "color": `${$scope.theme.l} !important`,
			    "text-decoration": "none !important",
			    "-webkit-text-fill-color": `${$scope.theme.l} !important`
			},
			"a:link:hover": {
			    "background": "rgba(0, 0, 0, 0.1) !important"
			},
			"img": {
			    "max-width": "100% !important"
			},
		    };

		    $scope.saveSettingsToStorage();

		    var el = angular.element( document.querySelector( '.app' ) );
		    el.css('background', $scope.theme.bg);
		    el.css('fontFamily', $scope.theme.ff);
		    el.css('color', $scope.theme.fg);
		    if($scope.state.rendition) {
			$scope.state.rendition.getContents().forEach(c => c.addStylesheetRules(rules));
			$scope.state.rendition.themes.default({
			    '::selection': {
				'background': 'rgba(255,255,0, 0.3)'
			    },
			    '.epubjs-hl' : {
				'fill': 'yellow', 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply'
			    }
			});
		    }
		    if(toggleSidebar) $scope.doSidebar();
		} catch (err) {
		    console.error("error applying theme", err);
		}
	    };
	    
	    $scope.setTheme = function (theme) {
	    	$scope.theme.bg = theme.bg;
	    	$scope.theme.fg = theme.fg;
		$scope.applyTheme(true);
	    };

	    $scope.setFontSize = function (size) {
		$scope.theme.fs = size;
		$scope.applyTheme(true);
	    };

	    $scope.loadFonts = function() {
		$scope.state.rendition.getContents().forEach(c => {
		    ["https://fonts.googleapis.com/css?family=Arbutus+Slab",
		     "https://fonts.googleapis.com/css?family=Lato:400,400i,700,700i",
		     "https://fonts.googleapis.com/css?family=Spectral",
		     "https://fonts.googleapis.com/css?family=Libre+Baskerville",
		     "https://fonts.googleapis.com/css?family=Merriweather"
		    ].forEach(url => {
			let el = c.document.body.appendChild(c.document.createElement("link"));
			el.setAttribute("rel", "stylesheet");
			el.setAttribute("href", url);
		    });
		});
	    };
	    
	    $scope.setLineSpacing = function (size) {
		$scope.theme.lh = size;
		$scope.applyTheme(true);
	    };
	    $scope.setMargin= function (size) {
		$scope.theme.m = size;
		$scope.applyTheme(true);
	    };
	    $scope.setFont= function (font) {
		$scope.theme.ff = font;
		$scope.applyTheme(true);
	    };

	    /********************************************************************************/
	    /*                      Opening the Book & Setup Handlers                       */
	    /********************************************************************************/

	    $scope.onBookReady = function () {
		
		$document.on('keydown', function (event) {
	    	    switch (event.keyCode) {
      	    	    case 37: 
	    		$scope.prevPage();
	    		break;
      	    	    case 39: 
	    		$scope.nextPage();
	    		break;
	    	    case 13:									    // get enter key to trigger search.
	    		if($scope.state.searchQuery) {						    
	    		    $scope.onSearchClick(false);
	    		    delete $scope.state.searchQuery;
	    		}
	    		break;
                    }            
		});



		$scope.state.chars = 1650;
		$scope.state.key = `${$scope.state.book.key()}:locations-${$scope.state.chars}`;
		let stored = $scope.useLocalStorage ? localStorage.getItem($scope.state.key) : false;
		console.log("storedLocations", typeof stored == "string" ? stored.substr(0, 40) + "..." : stored);

		$scope.loadBookmarksfromStorage();
		$scope.loadHighlightsfromStorage();
		
		if (stored) return $scope.state.book.locations.load(stored);
		console.log("generating locations");
		return $scope.state.book.locations.generate($scope.state.chars).then(() => {
		    if($scope.useLocalStorage) localStorage.setItem($scope.state.key, $scope.state.book.locations.save());
		    console.log("locations generated", $scope.state.book.locations);
		}).catch(err => console.error("error generating locations", err));

		// -----
		// let chars = 1650;
		// if($scope.useLocalStorage) {
		//     $scope.state.key = `${$scope.state.book.key()}:locations-${chars}`;
		//     let stored = localStorage.getItem($scope.state.key);
		//     console.log("storedLocations", typeof stored == "string" ? stored.substr(0, 40) + "..." : stored);
		//     if (stored) return $scope.state.book.locations.load(stored);
		// }

		// $scope.loadBookmarksfromStorage();

		// console.log("generating locations");
		// return $scope.state.book.locations.generate(chars).then(() => {
		//     if($scope.useLocalStorage) {
		// 	localStorage.setItem($scope.state.key, $scope.state.book.locations.save());
		// 	console.log("locations generated", $scope.state.book.locations);
		//     }
		// }).catch(err => console.error("error generating locations", err));
	    }
	    
	    $scope.doBook = function (url, opts) {
		opts = opts || {
		    encoding: "epub"
		};
		
		try {
		    $scope.state.book = ePub(url, opts);
		    let book = angular.element( document.querySelector( '.book' ) );
		    book[0].innerHTML = "";

		    $scope.state.rendition = $scope.state.book.renderTo(
			document.querySelectorAll('.book')[0], {
			});
		} catch (err) {
		    $scope.fatal("error loading book", err);
		    throw err;
		}
		
		$scope.state.book.ready.then($scope.onBookReady).catch( function (err) { $scope.fatal("error loading book", err, false) });
		$scope.state.book.loaded.metadata.then($scope.onMetadataLoaded).catch( function (err) { $scope.fatal("error loading metadata", err, false) });
		$scope.state.rendition.on("relocated", $scope.onRenditionRelocatedUpdateIndicators);
		$scope.state.book.loaded.navigation.then($scope.onNavigationLoaded).catch( function (err) { $scope.fatal("error loading table of contents", err, false) });
		$scope.state.book.loaded.cover.then($scope.onBookCoverLoaded).catch(err => $scope.fatal("error loading cover", err));
		$scope.state.rendition.hooks.content.register($scope.applyTheme);
		$scope.state.rendition.hooks.content.register($scope.loadFonts);
		$scope.state.rendition.on("relocated", $scope.onRenditionRelocated);

		// $scope.state.rendition.on("displayed", $scope.onRenditionDisplayedTouchSwipe);
		$scope.state.rendition.on("relocated", $scope.onRenditionRelocatedSavePos);
 		$scope.state.rendition.on("touchstart", $scope.onRenditionDisplayedTouchSwipe);
		$scope.state.rendition.on("started", $scope.onRenditionStartedRestorePos);
		$scope.state.rendition.on("displayError", $scope.fatal);
		// $scope.state.rendition.on("click", $scope.onRenditionSelected);
		$scope.state.rendition.on("click", $scope.onRenditionClick);
		$scope.state.rendition.on("selected", $scope.onRenditionSelected);

		$scope.state.rendition.display();

		if ($scope.state.dictInterval) window.clearInterval($scope.state.dictInterval);
		$scope.state.dictInterval = window.setInterval($scope.checkDictionary, 50);
		$scope.doDictionary(null);
	    };
	    

	    $scope.doOpenBook = function () {
		var fi = document.createElement("input");
		fi.setAttribute("accept", "application/epub+zip");
		fi.style.display = "none";
		fi.type = "file";
		fi.onchange = event => {
		    var reader = new FileReader();
		    reader.addEventListener("load", () => {
			var arr = (new Uint8Array(reader.result)).subarray(0, 2);
			var header = "";
			for (var i = 0; i < arr.length; i++) {
			    header += arr[i].toString(16);
			}
			if (header == "504b") {
			    this.doBook(reader.result, {
				encoding: "binary"
			    });
			} else {
			    $scope.fatal("invalid file", "not an epub book");
			}
		    }, false);
		    if (fi.files[0]) {
			reader.readAsArrayBuffer(fi.files[0]);
		    }
		};
		document.body.appendChild(fi);
		fi.click();
	    };

	    $scope.isBookLoaded = function () {
		return $scope.state.book;
	    }

	    /********************************************************************************/
	    /*                                 Metadata loading                             */
	    /********************************************************************************/

	    $scope.onMetadataLoaded = function (metadata) {
		$scope.metadata.title = metadata.title.trim();
		$scope.metadata.author = metadata.creator.trim();
		if (!metadata.series || metadata.series.trim() == "") 
		    $scope.metadata.series = false;
		else {
		    $scope.metadata.series = metadata.series.trim();
		    $scope.metadata.series.index = metadata.seriesIndex.trim();
		}

		$scope.metadata.description = sanitizeHtml(metadata.description);
		$scope.metadata.descriptionhtml = $sce.trustAsHtml($scope.metadata.description);
	    };

	    $scope.onBookCoverLoaded = function (url) {
		if(!url) return false;
		
		if (!$scope.state.book.archived) {
		    $scope.metadata.cover = url;
		    return;
		}

		$scope.state.book.archive.createUrl(url).then(url => {
		    $scope.metadata.cover = url;
		}).catch(err => $scope.fatal("error loading cover", err));
	    };

	    $scope.onNavigationLoaded = function (nav) {
		var toc = [];
		let handleItems = (items, indent) => {
		    items.forEach(item => {
			item.label = `${"&nbsp;".repeat(indent*4)}${item.label.trim()}`;
			item.labelHtml = $sce.trustAsHtml(item.label);
			toc.push(item);
			handleItems(item.subitems, indent + 1);
		    });
		};
		handleItems(nav.toc, 0);
		nav.toc = toc;
		$scope.navigation = nav;
	    };


	    /********************************************************************************/
	    /*                      Reader Location / Paging Management                     */
	    /********************************************************************************/
	    
	    $scope.nextPage = function () {
		$rootScope.$broadcast('epubReaderNextPage', {});
		$scope.state.rendition.next();
	    };

	    $scope.prevPage = function () {
		$rootScope.$broadcast('epubReaderPrevPage', {});
		$scope.state.rendition.prev();		
	    };
	    
	    $scope.locationClick = function () {
		try {
		    $ionicPopup.prompt({
			title: 'Location', inputType: 'text', template: `Location to go to (up to ${$scope.state.book.locations.length()})?`})
			.then(function(answer) {
			    console.log('starting reposition', answer);
			    if (!answer) return;
			    answer = answer.trim();
			    if (answer == "") return;
			    
			    let parsed = parseInt(answer, 10);
			    console.log('parsed', parsed);
			    if (isNaN(parsed) || parsed < 0) throw new Error("Invalid location: not a positive integer");
			    if (parsed > $scope.state.book.locations.length()) throw new Error("Invalid location");
			    
			    let cfi = $scope.state.book.locations.cfiFromLocation(parsed);
			    if (cfi === -1) throw new Error("Invalid location");
			    console.log('cfi', cfi);

			    console.log('going to:', cfi, 'from', parsed);
			    $scope.state.rendition.display(cfi);

			    // for some reason this relocation does not "take" on iOS. It works fine on the web but on iOS, it seems that a debounced resize event comes along and resets the
			    // location to the current "stored" location - which even after a display() has not be reset, so it ends up right back where it started. anecdotally I noticed
			    // that doing it twice worked, so I'm just calling this again. Quite hacky but I could not penetrate the thicket of epubjs code to figure out how to fix the bug.  
			    $timeout(function () { $scope.state.rendition.display(cfi); }, 250);

			    $rootScope.$broadcast('epubReaderSetLocation', 
						  {location: parsed, cfiRange: cfi, bookLength: $scope.state.book.locations.length()});

			});
		}
		catch (err) {
		    $ionicPopup.alert({title: "Error", content: '<p>' + err.toString() + '</p>'});
		}
	    };

	    $scope.gotoTocItem = function (href, event) {
		console.log("tocClick", href, $scope.state.book.canonical(href));
		$scope.state.rendition.display(href).catch(err => console.warn("error displaying page", err));
		$scope.doSidebar();
	    };


	    /********************************************************************************/
	    /*                                  Bookmarks                                   */
	    /********************************************************************************/

	    $scope.gotoMarkItem = function (bookmark) {
		console.log("bookmarkClick", bookmark);
		$scope.state.rendition.display(bookmark.cfi).catch(err => console.warn("error displaying page", err));
		$scope.doSidebar();
	    };

	    $scope.toggleBookmark = function () {
		if($scope.currentPosition) {
		    var bIndex = $scope.state.bookmarks.find(function (element) { return (element.cfi == $scope.currentPosition.cfi); });
		    if(typeof bIndex !== 'undefined') {
			$scope.deleteBookmark();
		    }
		    else {
			$scope.createBookmark();
		    }
		}
	    };

	    $scope.createBookmark = function () {
		if($scope.currentPosition) {
		    let savedP = $scope.currentPosition;
		    let savedContents = $scope.contents;

		    // bookmark: a cfi, a text extract, a location #. 
		    $scope.state.book.getRange($scope.currentPosition.cfi).then(function (range) {
			text = range.toString() || range.startContainer.data.substring(0, 200);
			console.log(text, range, $scope.currentPosition.cfi);

			let spineItem = $scope.state.book.spine.get($scope.currentPosition.cfi);
			let navItem = $scope.state.book.navigation.get(spineItem.href);
			let bookmark = {location: $scope.currentPosition.location, text: text, chapterLabel: navItem.label, cfi: savedP.cfi};

			$scope.state.bookmarks.push(bookmark);
			$scope.state.bookmarks.sort(function (b1, b2) { return ( (b1.location > b2.location) ? 1 : -1 ); });
			$scope.saveBookmarkstoStorage();
			$scope.state.rendition.annotations.mark($scope.currentPosition.cfi, {location: savedP.location}, 
								(e) => {
							     	    console.log("mark clicked", savedP, savedP.location, savedP.href, e.target);
								});
			$ionicPopup.alert({title: 'Saving Bookmark', template: savedP.cfi});
			$scope.state.isBookmarked = true;
			
			$rootScope.$broadcast('epubReaderBookmarkSave', {
			    bookmark: bookmark});
		    });
		    
		}
	    };
	    
	    $scope.deleteBookmark = function () {
		if($scope.currentPosition) {
		    var bIndex = $scope.state.bookmarks.find(function (element) { return (element.cfi == $scope.currentPosition.cfi); });
		    if(typeof bIndex !== 'undefined') {
			let deletedB = $scope.state.bookmarks.splice(bIndex, 1);		                             // delete from reader list
			$scope.state.isBookmarked = false;
			$scope.saveBookmarkstoStorage();
			$scope.state.rendition.annotations.remove($scope.currentPosition.cfi, "mark");	     // delete from rendition list
			$ionicPopup.alert({title: 'Deleted Bookmark', template: $scope.currentPosition.cfi});		     // notify any external apps
			
			$rootScope.$broadcast('epubReaderBookmarkDelete', {
			    bookmark: deletedB});
		    }
		}
	    };


	    $scope.saveBookmarkstoStorage = function () {
		if($scope.useLocalStorage) localStorage.setItem(`${$scope.state.book.key()}:bookmarks`, JSON.stringify($scope.state.bookmarks));

	    };

	    $scope.loadBookmarksfromStorage = function () {
		if($scope.useLocalStorage) {
		    let stored = localStorage.getItem(`${$scope.state.book.key()}:bookmarks`);
		    if(stored) {
			$scope.state.bookmarks = JSON.parse(stored);
		    }
		}
	    };



	    /********************************************************************************/
	    /*                  Handlers for change of location, paging etc.                */
	    /********************************************************************************/

	    // store position in local storage so we come back here on reload.
	    $scope.onRenditionRelocatedSavePos = function (event) {
		if($scope.useLocalStorage) localStorage.setItem(`${$scope.state.book.key()}:pos`, event.start.cfi);
		$scope.currentPosition = event.start;
		console.log('current location', $scope.currentPosition);

		// if this location is bookmarked, update display flag
		var bIndex = $scope.state.bookmarks.find(function (element) { return (element.cfi == $scope.currentPosition.cfi); });
		$scope.state.isBookmarked = (typeof bIndex !== 'undefined');
		$scope.$apply();

		$rootScope.$broadcast('epubReaderCurrentLocation', {
		    position: event.start.cfi
		});
	    };
	    
	    // reload location on reload of book
	    $scope.onRenditionStartedRestorePos = function (event) {
		try {
		    if($scope.useLocalStorage) {
			let stored = localStorage.getItem(`${$scope.state.book.key()}:pos`);
			console.log("goto storedPos", stored);
			if (stored) $scope.state.rendition.display(stored);
		    }
		} catch (err) {
		    $scope.fatal("error restoring position", err);
		}
	    };
	    
	    $scope.onRenditionRelocatedUpdateIndicators = function (event) {
		try {
		    let stxt = (event.start.location > 0) ? `Loc ${event.start.location}/${$scope.state.book.locations.length()}` : 
			((event.start.percentage > 0 && event.start.percentage < 1) ? `${Math.round(event.start.percentage * 100)}%` : ``);
		    $scope.state.locationString = stxt;
		    $scope.$apply();
		} catch (err) {
		    console.error("error updating indicators");
		}   
	    };
	    
	    // paging on swipe events. 
	    $scope.onRenditionDisplayedTouchSwipe = function (event) {
		$scope.start = null
		$scope.end = null;
		$scope.moving = false;
		$scope.listening = false;
		console.log('initialized touch handling');

		$scope.screenWidth = ( $scope.state.rendition && $scope.state.rendition.getContents() && $scope.state.rendition.getContents()[0]) ?
		    $scope.state.rendition.getContents()[0].content.clientWidth : 500;
		
		const el = event.document ? event.document.documentElement : event.currentTarget.documentElement;
		console.log( 'onRenditionDisplayedTouchSwipe' );
		
		el.addEventListener('touchstart', event => {
		    $scope.start = event.changedTouches[0];
		    console.log('touchstart', 'start is', $scope.start);
		});
		
		el.addEventListener('touchmove', event => {
		    console.log('touchmove');
		    $scope.moving = true;
		    
		    // it seems as though onRenditionDisplayedTouchSwipe may get called asynchronously and perhaps after start has already been set.
		    // This makes touchmoves also set start if it is missing, as mouse down won't do anything without it. 
		    if(!$scope.start) {
			$scope.start = event.changedTouches[0];
		    }

		    if(!$scope.listening) {
			$scope.listening = true;
			el.addEventListener('touchend', event => {
			    $scope.end = event.changedTouches[0];
			    console.log('touchend', $scope.end, 'start is', $scope.start);
			    if($scope.start && $scope.moving) {
				let hr = ($scope.end.screenX - $scope.start.screenX) / $scope.screenWidth;
				let vr = ($scope.end.screenY - $scope.start.screenY) / el.getBoundingClientRect().height;
				console.log('swipe', hr, vr);

				if (hr > vr && hr > 0.15) {
				    $scope.moving = false; $scope.start = false; return $scope.prevPage();
				}
				if (hr < vr && hr < -0.15) {
				    $scope.moving = false; $scope.start = false; return $scope.nextPage();
				}
				if (vr > hr && vr > 0.15) return;
				if (vr < hr && vr < -0.15) return;
			    }
			    else return;
			});
		    }
		});
	    };

	    // clicks at far left and right of screen initiate paging.
	    $scope.onRenditionClick = function (event, contents) {
		try {
		    console.log('onRenditionClick');
		    if (event.target.tagName.toLowerCase() == "a" && event.target.href) return;
		    if (event.target.parentNode.tagName.toLowerCase() == "a" && event.target.parentNode.href) return;
		    if (window.getSelection().toString().length !== 0) return;
		    if ($scope.state.rendition.manager.getContents()[0].window.getSelection().toString().length !== 0) return;
		} catch (err) {}
		
		let wrapper = $scope.state.rendition.manager.container;

		// this really is tricky - cuz picks on text at edge of page also trigger paging. probably kill this.....
		console.log('consider killing this');


		$scope.state.highlights.forEach(cfiRange => {
		    // $scope.state.book.getRange(cfiRange).then(function (range) {
			// console.log(range.getBoundingClientRect()); // doesn't work, comes up zeroes.

			var foo = contents.range(cfiRange);
			console.log(foo.getBoundingClientRect());
		        foo = foo.getBoundingClientRect();
			console.log(event.clientX, event.clientY, event.screenX, event.screenY, event.x, event.y);

		    if( (event.x > foo.left) &&
			(event.x < foo.right) &&
			(event.y > foo.top) &&
			(event.y < foo.bottom) ) {
			console.log('this range is found', cfiRange);
			$scope.cfiRange = cfiRange;
			$scope.contents = contents;
			$scope.showHighlightMenu();
		    }
			

		    //});
		});
			

		// let third = wrapper.clientWidth / 10; // 3 - made this just the edges of the screen to avoid double selections on highlights.
 		// let x = event.pageX - wrapper.scrollLeft;
		// let b = null;
		// if (x > wrapper.clientWidth - 20) {
		//     event.preventDefault();
		//     $scope.doSidebar();
		// } else if (x < third) {
		//     event.preventDefault();
		//     $scope.prevPage();
		//     b = false;
		//     //        b = this.qs(".bar button.prev");
		// } else if (x > (third * 9)) {
		//     event.preventDefault();
		//     $scope.nextPage();
		//     b = false;
		//     //        b = this.qs(".bar button.next");
		// }
		// if (b) {
		//     b.style.transform = "scale(1.15)";
		//     window.setTimeout(() => b.style.transform = "", 150);
		// }

		return false;
	    };
	    
	    // on paging/relocation, wipe the dictionary and update the active TOC entry.
	    $scope.onRenditionRelocated = function (event) {
		try {$scope.doDictionary(null);} catch (err) {}
		try {
		    $scope.navigation.toc.forEach(function (i, item) {
			item.active = ($scope.state.book.canonical(item.href) == $scope.state.book.canonical(event.start.href));
		    });
		} catch (err) {
		    $scope.fatal("error updating toc", err);
		}
	    };

	    /********************************************************************************/
	    /*                        Selection / Highlight Handling                        */
	    /********************************************************************************/

	    $scope.onRenditionSelected =  function(cfiRange, contents) {
		console.log('onRenditionSelected', cfiRange); // , contents);
		
		// if($scope.cfiRange) {   		// if we are editing a current range, delete the existing one, replace with new one
		//     alert('this should never happen');
		//     console.log('deleting edited range', $scope.cfiRange);
		//     $scope.state.rendition.annotations.remove($scope.cfiRange);
		// }

		$scope.cfiRange = cfiRange;
		$scope.contents = contents;
		$scope.showHighlightMenu();
	
		// generate highlight event.
		$scope.state.book.getRange($scope.cfiRange).then(function (range) {
		    text = range.toString();
		    $rootScope.$broadcast('epubReaderTextSelected', {text: text, cfiRange: $scope.cfiRange, range: range});
		});
	    };


	    $scope.showHighlightMenu = function () {
		console.log('show menu');

		if($scope.contents) $scope.contents.window.getSelection().removeAllRanges(); // remove range display. this also kills the selection handles which are distracting at this point.
		$scope.highlightMenuConfirmHighlight();					     // this will add the annotation display so the range is colored. it can be deleted later.
		

		// it appears that just after showing this, some events leak through. not sure why. debounce them.
		// const myHandler = (event) => {
		//     // do something with the event
		//     console.log('letting go of click events now', event);
		//     event.stopPropagation();
		//     event.preventDefault();
		// }
		// const dHandler = $scope.debounced(200, myHandler);
		// $window.addEventListener("click", dHandler);
		
		var buttons =  [ {text: '<i class="icon ion-checkmark-circled"></i>Save Highlight'}, 
				 {text: '<i class="icon ion-close-circled"></i>Delete Highlight'},
				 {text: '<i class="icon ion-android-create"></i>Create Note'},
				 {text: '<i class="icon custom-icon ion-google"></i>Google'},
				 {text: '<i class="icon custom-icon ion-wikipedia"></i>Wikipedia'},
			       ];

		// sometimes double events come through (click, touchstart); this keeps double displays from happening.
		if($scope.hideSheet) $scope.hideSheet();					    
		$scope.hideSheet =
		    $scope.actionSheet = $ionicActionSheet.show({				    // Show the action sheet
			    buttons: buttons,
			titleText: 'Selection Actions',
			cancelText: 'Cancel',
			cancel: function() {		// add cancel code..
			},
			buttonClicked: function(index) {
			    switch(index) {
			    case 0:
				$scope.highlightMenuConfirmHighlight();
				break;
			    case 1:
				$scope.highlightMenuDeleteHighlight();
				break;
			    case 2:
				$scope.popoverAddNote();
				break;
			    case 3:
				$scope.highlightMenuSearch('google');
				break;
			    case 4:
				$scope.highlightMenuSearch('wikipedia');
				break;
			    }
			    return true;
			}
		    });
	    };


	    
 
	    // accept the selection as a permanent highlight
	    $scope.highlightMenuConfirmHighlight = function () {
		if($scope.cfiRange) {
		    if($scope.state.highlights.indexOf($scope.cfiRange) < 0) { // it's not already in the list.
			let savedCFI = $scope.cfiRange;
			let savedContents = $scope.contents;
			$scope.state.highlights.push($scope.cfiRange);
			$scope.saveHighlightstoStorage();
			$scope.state.rendition.annotations.highlight($scope.cfiRange, {}, 
								     (e) => {
									 $timeout(function () {
							     		     console.log("highlight clicked", savedCFI, e.target);
									     $scope.cfiRange = savedCFI;
									     $scope.showHighlightMenu();
									     e.stopPropagation();
									 }, 200);
								     });
			
			
			$scope.state.book.getRange($scope.cfiRange).then(function (range) {
			    // cleanup
			    if($scope.contents) {
				$scope.contents.window.getSelection().removeAllRanges();
 				// $timeout(function () { 
				// 	$scope.contents.window.getSelection().removeAllRanges();
				// 	// same thing. $scope.selection.removeAllRanges();
				// }, 50);
				//			    $scope.state.rendition.display($scope.currentPosition.cfi);
			    }
			    
			    text = range.toString();						    // get text of current selection		
			    // generate event to pass out to generic angular app watching for it. 
			    $rootScope.$broadcast('epubReaderHighlightSaveRequested', {text: text, cfiRange: $scope.cfiRange, range: range});
			    $scope.cfiRange = false;
			    $scope.contents = false;
			    // $scope.closeHighlightMenu();
			    // for some reason, this alert displays before the screen repaints and the text highlights over-ride it. ick.
			    // $timeout(function () { 
			    //     $ionicPopup.alert({title: 'Saving Highlight', template: text});
			    // }, 1000);
			    
			    // return true;
			});
		    }
		}
		// since we save the highlight by default right away to deal with display issues, the cfirange can in fact be null. that's ok. just don't do anything.
		else {
		    // alert('why am i here');
		    $scope.closeHighlightMenu();
		}
	    };


	    $scope.saveHighlightstoStorage = function () {
		if($scope.useLocalStorage) localStorage.setItem(`${$scope.state.book.key()}:highlights`, JSON.stringify($scope.state.highlights));

	    };

	    $scope.loadHighlightsfromStorage = function () {
		if($scope.useLocalStorage) {
		    let stored = localStorage.getItem(`${$scope.state.book.key()}:highlights`);
		    if(stored) {
			$scope.state.highlights = JSON.parse(stored);

			$scope.state.highlights.forEach(cfiRange => {
			    $scope.state.rendition.annotations.highlight(cfiRange, {}, 
									 (e) => {
									     $timeout(function () {
										 console.log('event:::::::::::', e.type);
										 if(e.type == "touchstart") {
										     $scope.cfiRange = cfiRange;
							     			     console.log("highlight restored", cfiRange, e, e.target);
										     $scope.showHighlightMenu(); 
										     e.stopPropagation();
										 }
									     }, 200);
									 });
			});
		    }
		}
	    };

	    // If the user clicks out of the highlight menu without picking anything, need to erase the highlight
	    // $scope.$on('popover.hidden', function() {
	    // 	if($scope.cfiRange && $scope.isCFIDangling) {   // actions will set this range to false. if it's here, it's dangling.
	    // 	    $scope.state.book.getRange($scope.cfiRange).then(function (range) {
	    // 		text = range.toString();
	    // 		console.log('erasing temp highlight', $scope.cfiRange);

	    // 		if($scope.contents) {
	    // 		    $scope.contents.window.getSelection().removeAllRanges();
	    // 		}
	    // 		$scope.cfiRange = false;
	    // 	    });
	    // 	}
	    // });

	    // $scope.debounced = function (delay, fn) {
	    // 	let timerId;
	    // 	return function (...args) {
	    // 	    if (timerId) {
	    // 		clearTimeout(timerId);
	    // 	    }
	    // 	    timerId = setTimeout(() => {
	    // 		fn(...args);
	    // 		timerId = null;
	    // 	    }, delay);
	    // 	}
	    // };


	    
	    // code remnants from trying to get Popovers to display, hanging off the selection, without leaving behind the trace elements of the selection handles, 
	    // and without the presence of an actual click event, which I don't get epub.js
	    // var ev2 = $scope.eFromCFIRange(cfiRange, contents);
	    // $scope.openHighlightMenu(ev2,contents.range(cfiRange).startContainer.parentElement );


	    // also need the below in onRenditionSelected
	    // first time we pick a cfi range, dangling is true, so that if we click out of the menu, it will get deleted,
	    // but if a new one is selected, it's not necessary as it's deleted here.
	    // $scope.isCFIDangling = true;							   
	    // if($scope.cfiRange) {   		// if we are editing a current range, delete the existing one, replace with new one
	    // 	console.log('deleting edited range', $scope.cfiRange);
	    // 	$scope.state.rendition.annotations.remove($scope.cfiRange);
	    // 	$scope.isCFIDangling = false;
	    // }

	    // create a fake event to anchor the popup, as the real event has gotten eaten by ionic.
	    $scope.eFromCFIRange = function (cfiRange, contents) {
		var range = contents.range(cfiRange);
		var rect = range.getBoundingClientRect();
		// abortive logic to make the event pop above or below the highlighted text. but caught up in complications of column-based scrolling. doesn't work.
		// var midy = (rect.top + rect.bottom) / 2.0;
		// var left = rect.left;
		// var popoverY = contents.content.clientHeight / 2.0;
		// // what if midy is near bottom or top of screen?
		// if(rect.top > contents.content.clientHeight - 75) {   // > popoverY) { // selection in bottom half
		//     popoverY = rect.top - 50;
		// $scope.popoverUp = true;
		//     // the popover going on top:
		//     //$scope.popover.modalEl.classList.add("popover-bottom");
		// }
		// else {
		//     popoverY = rect.bottom + 25;
		//     $scope.popoverUp = false;
		//     //$scope.popover.modalEl.classList.remove("popover-bottom");
		// }
		// while( (left > contents.content.clientWidth) ) {  // display is in columns; get to screen space, not document space, by subtracting off screen widths til we get there.
		//     left = left - contents.content.clientWidth;
		// }
		
		var ev2 = {
		    target : {
			getBoundingClientRect : () => {
			    let foo = range.getBoundingClientRect();   // create a copy of this so I can edit it. 
			    let bar = {top: foo.top, left: foo.left, width: foo.width, height: foo.height};

			    // display is in columns; get to screen space, not document space, by subtracting off screen widths til we get there.
			    while( (bar.left > contents.content.clientWidth) ) { 
				bar.left = bar.left - contents.content.clientWidth;
			    }

			    bar.top = bar.top + 60;
			    return bar;
				
			    // return {
			    // 	top: popoverY,
			    // 	left: left, // -100, 
			    // 	width:  (rect.right - rect.left), 
			    // 	height: (rect.bottom - rect.top)  // just hardcoded small size so the box shows up in the right place.
			    // };
			}
		    }
		};
		return ev2;
	    };

	    $scope.highlightMenuDeleteHighlight = function () {
		if($scope.cfiRange) {
		    $scope.state.book.getRange($scope.cfiRange).then(function (range) {
			text = range.toString();
			$ionicPopup.alert({title: 'Deleting Highlight', template: text});
			console.log('deleting edited range', $scope.cfiRange);


			// var hIndex = $scope.state.highlights.find(function (element) { return (element == $scope.cfiRange); });
			var hIndex = $scope.state.highlights.indexOf($scope.cfiRange);
			if(typeof hIndex !== 'undefined') {
			    let deletedB = $scope.state.highlights.splice(hIndex, 1);		                             // delete from reader list
			    $scope.saveHighlightstoStorage();
			}
			else {
			    console.log('could not find highlight: ', $scope.cfiRange);
			}

			$scope.state.rendition.annotations.remove($scope.cfiRange);
			
			// generate event to pass out to generic angular app watching for it. 
			$rootScope.$broadcast('epubReaderHighlightDeleteRequested', {
			    text: text, cfiRange: $scope.cfiRange, range: range});

			// clear cfiRange so nothing else looks at it. 
			$scope.cfiRange = false;
			$scope.closeHighlightMenu();
			if($scope.contents) $scope.contents.window.getSelection().removeAllRanges();
		    });
		}
		else {
		    alert ('trying to delete nothing');
		    $scope.closeHighlightMenu();
		}
	    };

	    // ionic popover management
	    // $scope.openHighlightMenu = function($event, element) {
	    // 	void(element); // element passed in case I can figure out to trigger over the element, which should make the ionic popover go on top or bottom as appropriate.

	    // 	$scope.showMenu();
	    // 	return;

	    // 	if($scope.highlightMenu) {
	    // 	    $scope.highlightMenu.remove();
	    // 	    $scope.highlightMenu = false;
	    // 	}
		
	    // 	$ionicPopover.fromTemplateUrl('templates/highlightMenu.html', {scope: $scope})
	    // 	    .then(function(popover) {
    	    // 		$scope.highlightMenu = popover;
    	    // 		$scope.highlightMenu.show($event);
	    // 		// triggering on the element doesn't take into account the column scrolling of epub viewer so it comes in the wrong place.
    	    // 		// $scope.highlightMenu.show(element); 

	    // 		if($scope.popoverUp) {
	    // 		    $timeout( function () {
	    // 			if($scope.highlightMenu) {
	    // 			    $scope.highlightMenu.modalEl.classList.add("popover-bottom"); 	    // for some reason this is left off occassionally?
	    // 			}
	    // 		    }, 100);
	    // 		}
	    // 	    });
	    // };

	    $scope.closeHighlightMenu = function() {
    		// $scope.highlightMenu.hide();
		// $ionicBody.removeClass('popover-open');  // for some reason this is getting left hanging around....
	    };
	    
	    
	    // $scope.$on('$destroy', function() {
	    // 	console.log('destroyed');
	    // 	$scope.highlightMenu.remove();
	    // });


	    /********************************************************************************/
	    /*                         External Search Handling                             */
	    /********************************************************************************/

	    $scope.highlightMenuSearch = function (engine) {
		if($scope.cfiRange) {
		    $scope.state.book.getRange($scope.cfiRange).then(function (range) {
			text = range.toString();
			let url = false;
			if(engine == 'google') url = "https://www.google.com/search?q="+text;
			if(engine == 'wikipedia') url = "https://en.wikipedia.org/wiki/Special:Search?search=" + text;
			if($scope.contents) $scope.contents.window.getSelection().removeAllRanges();
			if(url) $scope.openBrowser(url);
		    });
		}
	    };

	    $scope.openBrowser = function (url) {
		var isApp = ionic.Platform.isWebView() && (ionic.Platform.isIOS() || ionic.Platform.isAndroid());
		if(isApp) { // 		if(typeof cordova !== 'undefined') {
		    var target = "_system";
		    var options = "location=yes,hidden=no,footer=yes";
		    cordova.InAppBrowser.open(url, target, options);
		}
		else {
		    window.open(url, '_system');
		}
	    };



	    /********************************************************************************/
	    /*                            Internal Search                                   */
	    /********************************************************************************/

	    $scope.onSearchClick = function (event) {
		$scope.doSearch($scope.state.searchQuery.trim()).then(results => {
		    $scope.state.searchResults = results.slice(0, 200);
		    $scope.$apply();
		}).catch(err => $scope.fatal("error searching book", err));
	    };

	    $scope.doSearch = function (q) {
		return Promise.all($scope.state.book.spine.spineItems.map(item => {
		    return item.load($scope.state.book.load.bind($scope.state.book)).then(doc => {
			let results = item.find(q);
			item.unload();
			return Promise.resolve(results);
		    });
		})).then(results => Promise.resolve([].concat.apply([], results)));
	    };

	    $scope.onResultClick = function (cfi) {
		console.log("tocClick", cfi);
		$scope.state.rendition.display(cfi);
		$scope.doSidebar();
	    };
	    
	    $scope.doSidebar = function () {
		$scope.state.sidebar = !$scope.state.sidebar;
	    };

	    $scope.onTabClick =  function ($event, tab) {
		console.log("tabClick", tab);
		$scope.state.activeTab = tab;
	    };

	    $scope.doFullscreen = function () {
		document.fullscreenEnabled = document.fullscreenEnabled || document.mozFullScreenEnabled || document.documentElement.webkitRequestFullScreen;
		
		let requestFullscreen = element => {
		    if (element.requestFullscreen) {
			element.requestFullscreen();
		    } else if (element.mozRequestFullScreen) {
			element.mozRequestFullScreen();
		    } else if (element.webkitRequestFullScreen) {
			element.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
		    }
		};

		if (document.fullscreenEnabled) {
		    requestFullscreen(document.documentElement);
		}
	    };
	    
	    $scope.doReset = function () {
		$ionicPopup.confirm({title: 'Reset All?', template: 'Are you sure?'}).then(function(res) {
		    if(res) {
			localStorage.clear();
			window.location.reload();
		    }
		});
	    };

	    /********************************************************************************/
	    /*                                 Dictionary                                   */
	    /********************************************************************************/

	    
	    $scope.checkDictionary = function () {
		try {
		    let manager = $scope.state.rendition.manager;
		    let sel = manager ? $scope.state.rendition.manager.getContents() : false;
		    let window = (sel && (sel.length > 0) && (typeof sel[0].window !== 'undefined')) ? sel[0].window : false;
		    let selection = window ? window.getSelection().toString().trim() : "";
		    if (!selection || selection.length < 2 || selection.indexOf(" ") > -1) {
			if ($scope.state.showDictTimeout) window.clearTimeout($scope.state.showDictTimeout);
			$scope.doDictionary(null);
			return;
		    }
		    $scope.state.showDictTimeout = window.setTimeout(() => {
			try {
			    let newSelection = $scope.state.rendition.manager.getContents()[0].window.getSelection().toString().trim();
			    if (newSelection == selection) $scope.doDictionary(newSelection);
			    else $scope.doDictionary(null);

			} catch (err) {console.error(`showDictTimeout: ${err.toString()}`)}
		    }, 300);
		} catch (err) {
		    console.error(`checkDictionary: ${err.toString()}`)
		}
	    };
	    
	    $scope.doDictionary = function (word) {
		return;

		if ($scope.state.lastWord) if ($scope.state.lastWord == word) return;
		$scope.state.lastWord = word;
		
		// if there is no word passed: reset dictionary if it is set. apply to get rid of existing notes.
		if(!word) {
		    if($scope.dictionary) {
			$scope.dictionary = false;
			$scope.$apply();
		    }
		    return;
		}

		$scope.dictionary = {word: word};
		
		console.log(`define ${word}`);
		let url = `https://dict.geek1011.net/word/${encodeURIComponent(word)}`;
		fetch(url).then(resp => {
		    if (resp.status >= 500) throw new Error(`Dictionary not available`);
		    return resp.json();
		}).then(obj => {
		    if (obj.status == "error") throw new Error(`ApiError: ${obj.result}`);
		    return obj.result;
		}).then(word => {
		    // console.log("dictLookup", word);
		    if (word.info && word.info.trim() != "") $scope.dictionary.info = word.info;
		    $scope.dictionary.meanings = word.meanings;
		    if (word.credit && word.credit.trim() != "") {
			$scope.dictionary.credit = word.credit;
		    }

		    $scope.$apply();

		}).catch(err => {
		    try {
			console.error("dictLookup", err);
			if (err.toString().toLowerCase().indexOf("not in dictionary") > -1) {
			    $scope.dictionary.error = "Word not in dictionary.";
			    $scope.$apply();
			    return;
			}
			if (err.toString().toLowerCase().indexOf("not available") > -1 || err.toString().indexOf("networkerror") > -1 || err.toString().indexOf("failed to fetch") > -1) {
			    $scope.dictionary.error = "Word not in dictionary.";
			    $scope.$apply();
			    return;
			}
			$scope.dictionary.error = `Dictionary not available: ${err.toString()}`;
			$scope.$apply();

		    } catch (err) {}
		});
	    };
	    
	
	    $scope.fatal = function (msg, err, usersFault) {
		if( (typeof msg === 'undefined') || !msg) msg = "Error";
		if( (typeof err === 'undefined') || !err) err = "Error";

		console.log(msg, err);
		$scope.state.error = true;
		$scope.state.errorTitle = "Error";
		$scope.state.errorDescription = usersFault ? "" : "Please try again. If the error persists please email us at mark@thehawaiiproject.com to report the issue.";
		$scope.state.errorInfo = msg + ": " + err.toString();

		$ionicPopup.alert({title: "Error", content: '<p>' + $scope.state.errorInfo + '</p><p>' + $scope.state.errorDescription + '</p>'})
		    .then(function(result) {
			void(result);  /* just to get jshint to shut up */
		    });
		try {
		    // if (!usersFault) Raven.captureException(err);
		    // could log error with Fabric or Raven if desired. 
		} catch (err) {}
	    };

	    /********************************************************************************/
	    /*                         Initialize and get going                             */
	    /********************************************************************************/

	    $scope.loadSettingsFromStorage();
	    
	    try {
		let ufn = location.search.replace("?", "") || location.hash.replace("#", "") || ($scope.src ? $scope.src : "");
		if (ufn.startsWith("!")) {
		    ufn = ufn.replace("!", "");
		    document.querySelector(".app button.open").style = "display: none !important";
		}
		
		// can stream from a url like this:
		// ufn = "https://standardebooks.org/ebooks/walter-scott/ivanhoe/dist/walter-scott_ivanhoe.epub";
		if (ufn) {
		    fetch(ufn).then(resp => {
			if (resp.status != 200) throw new Error("response status: " + resp.status.toString() + " " + resp.statusText);
		    }).catch(err => {
			$scope.fatal("error loading book", err, false);
		    });

		    $scope.doBook(ufn);
		}
		else {
		    $scope.doOpenBook();
		}
	    } catch (err) {
		$scope.fatal("There was an error loading the file", err, false);
	    }
	},

	link: function(scope, element, attrs) {
	}
    }
})
