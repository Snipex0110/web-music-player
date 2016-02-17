/*
 * main AngularJS code for wmp
 * version 1.0.0
 */
'use strict';
angular
//declare module and dependencies
.module('wmpApp', ['ngResource', 'ngRoute', 'ng-sortable', 'ngAnimate'])
//declare configuration
.config(config)
//declare playlist service
.service('Playlist', ['User', 'PlaylistItem', Playlist])
//declare player controller
.controller('PlayerController', ['$scope', 'Playlist', 'PlaylistItem', 'Audio', 'User', '$window', PlayerController])
//declare menu controller
.controller('MenuController', ['User', '$window', MenuController])
//declare library controller
.controller('LibraryController', ['Library', 'Playlist', LibraryController])
//declare catalog controller
.controller('CatalogController', ['Library', 'Folder', CatalogController])
//declare sign-out controller
.controller('SignOutController', ['User', '$window', SignOutController])
//declare filter converting duration in seconds into a datetime
.filter('duration', duration);
//playlist function
function Playlist(User, PlaylistItem) {
    var playlist = this;
    //get tracks
    playlist.tracks = PlaylistItem.query({userId: User.id});
    //initialize current track
    playlist.currentTrack = 0;
    //declare function for add track in playlist
    playlist.add = add;
    //function to add a track to the user playlist
    function add(track) {
        var playlistItem = new PlaylistItem(track);
        playlistItem.userId = User.id;
        PlaylistItem.save(playlistItem, function(data) {
            //success, add to playlist
            playlist.tracks.push(data);
        }, function(error) {
            //error, alert user
            alert(error.data.message);
        });
    }
}
//PlayerController function
function PlayerController($scope, Playlist, PlaylistItem, Audio, User, $window) {
    var player = this;
    //check user profile
    player.user = User;
    if (!player.user.getProfile() || !Number.isInteger(player.user.id)) {
        $window.location = '/sign';
        //redirect to sign in page
        return false;
    }
    //create player
    var audio = Audio;
    player.isPlaying = false;
    player.isPaused = false;
    player.currentTime = 0;
    player.duration = 0;
    //declare functions for controlling player
    player.play = play;
    player.pause = pause;
    player.previous = previous;
    player.next = next;
    player.seek = seek;
    //automatic handlers
    audio.onended = onEnded;
    audio.ontimeupdate = onTimeUpdate;
    audio.ondurationchange = onDurationChange;
    //link playlist to Playlist service
    player.playlist = Playlist;
    //add to PLaylist service the removing track function
    player.playlist.remove = remove;
    //sort playlist
    player.playlistSort = {
        draggable: '.track',
        handle: '.track-handle',
        filter: '.grid-header',
        sort: true,
        animation: 1000,
        onUpdate(evt) {
            //apply local change
            if (evt.oldIndex < player.playlist.currentTrack && evt.newIndex >= player.playlist.currentTrack) {
                player.playlist.currentTrack--;
            } else if (evt.oldIndex > player.playlist.currentTrack && evt.newIndex <= player.playlist.currentTrack) {
                player.playlist.currentTrack++;
            } else if (evt.oldIndex === player.playlist.currentTrack) {
                player.playlist.currentTrack = evt.newIndex;
            }
            //update playlist on server
            if (evt.newIndex > evt.oldIndex) {
                evt.model.newSequence = player.playlist.tracks[evt.newIndex - 1].sequence;
            } else if (evt.newIndex < evt.oldIndex) {
                evt.model.newSequence = player.playlist.tracks[evt.newIndex + 1].sequence;
            }
            var playlistItem = new PlaylistItem(evt.model);
            PlaylistItem.update(playlistItem, function(data) {
                //success, apply display change
                player.playlist.tracks = data;
            }, function(error) {
                //error, alert user
                alert(error.data.message);
            });
        }
    };
    //function for playing current track in playlist
    function play(trackIndex) {
        if (this.playlist.tracks.length > 0 && this.playlist.tracks.length > this.playlist.currentTrack) {
            if (this.isPaused && !angular.isDefined(trackIndex)) {
                //resume the playing (only if there is no specific track asked)
                audio.play();
            } else {
                //load new track and play it
                if (angular.isDefined(trackIndex)) {
                    this.playlist.currentTrack = trackIndex;
                }
                //get token and send it in query string
                var token = this.user.getToken();
                var queryParameter = '';
                if (token) {
                    queryParameter = '?token=' + encodeURIComponent(token);
                }
                audio.src = this.playlist.tracks[this.playlist.currentTrack].file + queryParameter;
                audio.play();
                this.currentTime = 0;
            }
            this.isPlaying = true;
            this.isPaused = false;
        }
    }
    //function to pause the playing
    function pause() {
        if (this.isPlaying) {
            audio.pause();
            this.isPaused = true;
            this.isPlaying = false;
        }
    }
    //function for playing previous track in playlist
    function previous() {
        if (!this.playlist.tracks.length) {
            return;
        }
        this.isPaused = false;
        if (this.playlist.currentTrack > 0) {
            //go to previous track
            this.playlist.currentTrack--;
        } else {
            //go to the last track
            this.playlist.currentTrack = this.playlist.tracks.length - 1;
        }
        this.play();
    }
    //function for playing next track in playlist
    function next() {
        if (!this.playlist.tracks.length) {
            //there is no track to play, stop the playing
            audio.pause();
            this.isPaused = true;
            this.isPlaying = false;
            return;
        }
        this.isPaused = false;
        this.isPlaying = true;
        if (this.playlist.tracks.length > (this.playlist.currentTrack + 1)) {
            //go to next track
            this.playlist.currentTrack++;
        } else {
            //come back to the first track
            this.playlist.currentTrack = 0;
        }
        this.play(this.playlist.currentTrack);
    }
    //function for seeking in track
    function seek() {
        audio.currentTime = this.currentTime;
    }
    //function to remove a track from the user playlist
    function remove(track) {
        track.$delete(function() {
            //success, apply display change
            var trackRemovedIndex = player.playlist.tracks.indexOf(track);
            var currentTrack = player.playlist.currentTrack;
            //remove track from the playlist
            player.playlist.tracks.splice(trackRemovedIndex, 1);
            //update currentTrack index
            if (currentTrack >= trackRemovedIndex) {
                if (currentTrack >= 0) {
                    player.playlist.currentTrack--;
                }
                //go to next track if the removed track was playing
                if (player.isPlaying && currentTrack === trackRemovedIndex) {
                    player.next();
                }
                if (player.playlist.currentTrack < 0) {
                    player.playlist.currentTrack = 0;
                }
            }
        }, function(error) {
            //error, alert user
            alert(error.data.message);
        });
    }
    //automatic call to the next function when track is ended
    function onEnded() {
        $scope.$apply(player.next());
    };
    //automatic update seeker
    function onTimeUpdate() {
        $scope.$apply(player.currentTime = this.currentTime);
    };
    //automatic update seeker max range
    function onDurationChange() {
        $scope.$apply(player.duration = this.duration);
    };
}
//LibraryController function
function LibraryController(Library, Playlist) {
    var librarys = this;
    //get library
    librarys.tracks = [];
    librarys.order = ['title','artist'];
    librarys.search = {
        artist: null,
        album: null,
        title: null,
        displayFilter: {
            artist: false,
            album: false,
            title: false
        },
        query() {
            librarys.tracks = Library.query({
                title: this.title,
                album: this.album,
                artist: this.artist
            });
        }
    };
    //add link to Playlist service ("add track to playlist" function)
    librarys.add = Playlist.add;
    librarys.search.query();
}
//MenuController function
function MenuController(User, $window) {
    var menu = this;
    menu.visible = false;
    menu.items = [];
    var existingItems = [
        {require: 'user', label: 'Player', icon: 'fa-headphones', link: '/player'},
        {require: 'user', label: 'Library', icon: 'fa-archive', link: '/library'},
        {require: 'admin', label: 'Catalog', icon: 'fa-folder-open', link: '/catalog'},
        {require: 'user', label: 'Profile', icon: 'fa-user', link: '/profile'},
        {require: 'admin', label: 'Admin', icon: 'fa-sliders', link: '/admin'},
        {require: 'user', label: 'Sign out', icon: 'fa-sign-out', link: '/sign-out'},
        {require: 'user', label: 'Find an issue ?', icon: 'fa-bug', link: 'https://github.com/nioc/web-music-player/issues/new'},
        {require: 'user', label: 'Contribute', icon: 'fa-code-fork', link: 'https://github.com/nioc/web-music-player#contributing'}
   ];
    menu.currentPage = existingItems[0];
    menu.toggle = toggle;
    //check user profile
    var user = User;
    if (!user.getProfile() || !Number.isInteger(user.id)) {
        $window.location = '/sign';
        //no valid token found, redirect to sign in page
        return false;
    }
    //add links according to user scope
    angular.forEach(existingItems, function(item) {
        if (user.scope.indexOf(item.require) !== -1) {
            item.isCurrentPage = isCurrentPage;
            item.setCurrentPage = setCurrentPage;
            menu.items.push(item);
        }
    });
    //toggle menu display
    function toggle() {
        this.visible = !this.visible;
    };
    //highlight current page
    function isCurrentPage() {
        return this.link === $window.location.pathname;
    }
    //store the next page and hide menu
    function setCurrentPage() {
        menu.currentPage = this;
        menu.toggle();
    }
}
//CatalogController function
function CatalogController(Library, Folder) {
    var catalog = this;
    catalog.folders = Folder.query();
    catalog.expandFolder = function(folder) {
        folder.show = !folder.show;
    };
    catalog.addFolder = function(folder) {
        if (folder.path !== '') {
            Library.save({'folder': folder.path}, function(data) {
                //success, apply display change
                //@TODO
            }, function(error) {
                //error, alert user
                alert(error.data.message);
            });
        }
    };
}
//SignOutController function
function SignOutController(User, $window) {
    User.deleteToken();
    $window.location = '/sign';
}
//duration filter function
function duration() {
    return function(seconds) {
        return new Date(1970, 0, 1).setSeconds(seconds);
    };
}
//Configuration function
function config($routeProvider, $locationProvider) {
    $routeProvider
    .when('/player', {
    })
    .when('/library', {
        templateUrl: '/library',
        controller: 'LibraryController',
        controllerAs: 'library'
    })
    .when('/catalog', {
        templateUrl: '/catalog',
        controller: 'CatalogController',
        controllerAs: 'catalog'
    })
    .when('/sign-out', {
        templateUrl: '/sign-out',
        controller: 'SignOutController'
    })
    .otherwise({
        redirectTo: '/player'
    });
    $locationProvider.html5Mode(true);
}
