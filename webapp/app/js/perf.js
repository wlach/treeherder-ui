/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var perf = angular.module("perf", ['ui.router', 'ui.bootstrap']);

/* Copied from providers.js */
perf.provider('thServiceDomain', function() {
    this.$get = function() {
        if (window.thServiceDomain) {
            return window.thServiceDomain;
        } else {
            return "";
        }
    };
});

perf.value('seriesColors', [ 'red', 'green', 'blue', 'orange', 'purple' ]);

perf.factory('seriesSummary', ['seriesColors', function(seriesColors) {
  return function(signature, signatureProps, projectName, optionCollectionMap,
                  number) {
    var platform = signatureProps.machine_platform + " " +
      signatureProps.machine_architecture;
    var extra = "";
    if (signatureProps.job_group_symbol === "T-e10s") {
      extra = " e10s";
    }
    var testName = signatureProps.test;
    if (testName === undefined)
      testName = "summary";

    var name = signatureProps.suite + " " + testName +
      " " + optionCollectionMap[signatureProps.option_collection_hash] + extra;
    var signatureName = name;
    return { name: name, signature: signature, platform: platform,
             projectName: projectName, color: seriesColors[number] };
  };
}]);

perf.controller('PerfCtrl', [ '$state', '$stateParams', '$scope', '$rootScope', '$location',
                              '$modal', 'thServiceDomain', '$http', '$q', 'seriesSummary',
                              'seriesColors',
  function PerfCtrl($state, $stateParams, $scope, $rootScope, $location, $modal,
                    thServiceDomain, $http, $q, seriesSummary, seriesColors) {
    $scope.timeranges = [
      { "value":86400, "text": "Last day" },
      { "value":604800, "text": "Last 7 days" },
      { "value":1209600, "text": "Last 14 days" },
      { "value":2592000, "text": "Last 30 days" },
      { "value":5184000, "text": "Last 60 days" },
      { "value":7776000, "text": "Last 90 days" } ];

    if ($stateParams.timerange) {
      for (var i in $scope.timeranges) {
        var timerange = $scope.timeranges[i];
        if (timerange.value == $stateParams.timerange) {
          $scope.myTimerange = timerange;
          break;
        }
      }
    }


    $scope.resetTooltipContent = function(thSeries) {
      $scope.tooltipContent = { revision: "(loading revision...)",
                                revisionHref:  "",
                                branch: thSeries.projectName,
                                test: thSeries.name,
                                platform: thSeries.platform,
                                machine: thSeries.machine || 'mean' };
      $scope.$digest();
    };

    $scope.ttHideTimer = null;
    $scope.ttLocked = false;

    $scope.updateTooltip = function(item) {
      if ($scope.ttLocked) return;

      var i = item.dataIndex,
      s = item.series;

      $scope.resetTooltipContent(s.thSeries);
      $http.get(thServiceDomain + '/api/project/' + s.thSeries.projectName +
                '/resultset/' + s.resultSetData[i]).then(function(response) {
                  var revision = response.data.revisions[0].revision;
                  $scope.tooltipContent.revision = revision;
                  $scope.projects.forEach(function(project) {
                    if (project.name == s.thSeries.projectName) {
                      $scope.tooltipContent.revisionHref = project.url + "/rev/" +
                        revision;
                    }
                  });
                });

      var index = 1;
      var t = item.datapoint[0],
      v = item.datapoint[1],
      v0 = i ? s.data[i - 1][index] : v,
      dv = v - v0,
      dvp = v / v0 - 1;

      $scope.tooltipContent.value = Math.round(v*1000)/1000;
      $scope.tooltipContent.deltaValue = dv.toFixed(1);
      $scope.tooltipContent.deltaPercentValue = (100 * dvp).toFixed(1);
      $scope.tooltipContent.date = $.plot.formatDate(new Date(t), '%a %b %d, %H:%M:%S');
      $scope.$digest();

      this.plot.unhighlight();
      this.plot.highlight(s, item.datapoint);
    };

    $scope.showTooltip = function(x, y) {
      if ($scope.ttLocked) return;

      if ($scope.ttHideTimer) {
        clearTimeout($scope.ttHideTimer);
        $scope.ttHideTimer = null;
      }

      var tip = $('#graph-tooltip'),
        w = tip.width(),
        h = tip.height(),
        left = x - w / 2,
        top = y - h - 10;

      tip.stop(true);

      if (tip.css('visibility') == 'hidden') {
        tip.css({ opacity: 0, visibility: 'visible', left: left,
                  top: top + 10 });
        tip.animate({ opacity: 1, top: top }, 250);
      } else {
        tip.css({ opacity: 1, left: left, top: top });
      }
    }

    $scope.hideTooltip = function(now) {
      if ($scope.ttLocked) return;

      var tip = $('#graph-tooltip');

      if (!$scope.ttHideTimer && tip.css('visibility') == 'visible') {
        $scope.ttHideTimer = setTimeout(function() {
          $scope.ttHideTimer = null;
          $scope.plot.unhighlight();
          tip.animate({ opacity: 0, top: '+=10' },
                      250, 'linear', function() {
                        $(this).css({ visibility: 'hidden' });
                      });
        }, now ? 0 : 250);
      }
    };

    $scope.lockTooltip = function() {
      $scope.ttLocked = true;
      $scope.$digest();
    };

    Mousetrap.bind('escape', function() {
      $scope.ttLocked = false;
      $scope.hideTooltip();
    });

    function plotGraph() {
      $scope.plot = $.plot($("#graph"),
                        $scope.seriesList.map(
                          function(series) { return series.flotSeries }),
                           {
                             xaxis: { mode: 'time' },
                             selection: { mode: 'xy', color: '#97c6e5' },
                             series: { shadowSize: 0 },
                             lines: { show: false },
                             points: { show: true },
                             colors: seriesColors,
                             legend: { show: false },
                             grid: {
                               color: '#cdd6df',
                               borderWidth: 2,
                               backgroundColor: '#fff',
                               hoverable: true,
                               clickable: true,
                               autoHighlight: false
                             }
                           });

      function getDateStr(timestamp) {
        var date = new Date(parseInt(timestamp));
        return date.toUTCString();
      }

      $("#graph").bind("plothover", function (event, pos, item) {
        $('#graph').css({ cursor: item ? 'pointer' : 'default' });

        if (item && item.series.thSeries) {
          if (item.seriesIndex != $scope.prevSeriesIndex ||
              item.dataIndex != $scope.prevDataIndex) {

            $scope.updateTooltip(item);
            $scope.showTooltip(item.pageX, item.pageY);
            $scope.prevSeriesIndex = item.seriesIndex;
            $scope.prevDataIndex = item.dataIndex;
          }
        } else {
          $scope.hideTooltip();
          $scope.prevSeriesIndex = null;
          $scope.prevDataIndex = null;
        }
      });

      $('#graph').bind('plotclick', function(e, pos, item) {
        $scope.ttLocked = false;
        if (item) {
          $scope.updateTooltip(item);
          $scope.showTooltip(item.pageX, item.pageY);
          $scope.ttLocked = true;
        } else {
          $scope.hideTooltip();
        }
        $scope.$digest();
      });
    }

    if (!$scope.myTimerange) {
      // 7 days is a sensible default
      $scope.myTimerange = $scope.timeranges[1];
    }

    $scope.timeRangeChanged = function() {
      $state.go('graphs', { 'timerange': $scope.myTimerange.value });
    }

    $scope.repoName = $stateParams.projectId;

    $scope.reload = function() {
      $state.transitionTo('graphs', { 'timerange': $scope.myTimerange.value,
                            'series':
                            $scope.seriesList.map(function(series) {
                              return encodeURIComponent(
                                JSON.stringify(
                                  { project: series.projectName,
                                    signature: series.signature,
                                    visibility: series.visibility})); })
                                    },
                {location: true, inherit: true, relative: $state.$current,
                 notify: false});
    };

    $scope.removeSeries = function(signature) {
      var newSeriesList = [];
      $scope.seriesList.forEach(function(series) {
        if (series.signature !== signature) {
          newSeriesList.push(series);
        }
      });
      $scope.seriesList = newSeriesList;

      $scope.reload();
    };

    $scope.showHideSeries = function(signature){
      var seriesToToggle = _.find($scope.seriesList, function(series) { return series.signature == signature });
      seriesToToggle.visibility = !seriesToToggle.visibility;
      $scope.reload();
    }

    var optionCollectionMap = {};

    $http.get(thServiceDomain + '/api/optioncollectionhash').then(
      function(response) {
        response.data.forEach(function(dict) {
          optionCollectionMap[dict.option_collection_hash] =
            dict.options.map(function(option) {
              return option.name; }).join(" ");
        });
      }).then(function() {
        if ($stateParams.series) {
          $scope.seriesList = [];
          if (_.isString($stateParams.series)) {
            $stateParams.series = [$stateParams.series];
          }
          // we only store the signature + project name in the url, we need to
          // fetch everything else from the server
          var partialSeriesList = $stateParams.series.map(function(encodedSeries) {
            return JSON.parse(decodeURIComponent(encodedSeries));
          });
          var propsHash = {}
          $q.all(partialSeriesList.map(
            function(partialSeries) {
              return $http.get(thServiceDomain + '/api/project/' +
                               partialSeries.project + '/performance-data/0/' +
                               'get_signature_properties/?signatures=' +
                               partialSeries.signature).then(function(response) {
                                 var data = response.data;
                                 if (!propsHash[partialSeries.project]) {
                                   propsHash[partialSeries.project] = {};
                                 }
                                 propsHash[partialSeries.project][partialSeries.signature] = data[0];
                                 propsHash[partialSeries.project][partialSeries.signature]['visibility'] = partialSeries.visibility;
                               });
            })).then(function() {
              var i = 0;
              Object.keys(propsHash).forEach(function(projectName) {
                Object.keys(propsHash[projectName]).forEach(function(signature) {
                  var series_summary = seriesSummary(signature, propsHash[projectName][signature], projectName,
                                                    optionCollectionMap, i);
                  series_summary['visibility'] = propsHash[projectName][signature]['visibility'];
                  $scope.seriesList.push(series_summary);
                  i++;
                });
              });
              $q.all($scope.seriesList.map(function(series) {
                return $http.get(thServiceDomain + '/api/project/' +
                                 series.projectName +
                                 '/performance-data/0/get_performance_data/' +
                                 '?interval_seconds=' + $scope.myTimerange.value +
                                 '&signatures=' + series.signature).then(
                                   function(response) {
                                     var flotSeries = {
                                       lines: { show: false },
                                       points: { show: true },
                                       label: series.projectName + " " + series.name,
                                       data: [],
                                       resultSetData: [],
                                       thSeries: jQuery.extend({}, series)
                                     }
                                     response.data[0].blob.forEach(function(dataPoint) {
                                       var mean = dataPoint.mean;
                                       if (mean === undefined)
                                         mean = dataPoint.geomean;

                                       flotSeries.data.push([
                                         new Date(dataPoint.push_timestamp*1000),
                                         mean]);
                                       flotSeries.resultSetData.push(dataPoint.result_set_id);
                                       flotSeries.data.sort(function(a,b) { return a[0] > b[0]; });
                                     });
                                     series.flotSeries = flotSeries;
                                   });
              })).then(function() {
                      $scope.seriesList.forEach(function(series) {
                        if (series.visibility) {
                          $('#check-'+series.signature).prop('checked', true);
                        } else {
                            $('#check-'+series.signature).prop('checked', false);
                            series.flotSeries.points.show = false;
                        }
                      });
                      plotGraph();
                });
            });
        } else {
          $scope.seriesList = [];
        }

        $http.get(thServiceDomain + '/api/repository/').then(function(response) {
          $scope.projects = response.data;

          $scope.addTestData = function() {
            var defaultProjectName, defaultPlatform;
            if ($scope.seriesList.length > 0) {
              var lastSeries = $scope.seriesList.slice(-1)[0];
              defaultProjectName = lastSeries.projectName;
              defaultPlatform = lastSeries.platform;
            }

            var modalInstance = $modal.open({
              templateUrl: 'partials/perf/testdatachooser.html',
              controller: 'TestChooserCtrl',
              resolve: {
                projects: function() {
                  return $scope.projects;
                },
                optionCollectionMap: function() {
                  return optionCollectionMap;
                },
                timeRange: function() {
                  return $scope.myTimerange.value;
                },
                defaultProjectName: function() { return defaultProjectName; },
                defaultPlatform: function() { return defaultPlatform; }
              }
            });

            modalInstance.opened.then(function () {
              window.setTimeout(function () { modalInstance.updateTestInput(); }, 0);
            });

            modalInstance.result.then(function(series) {
              series.visibility = true;
              $scope.seriesList.push(series);
              $scope.reload();
            });
          };
        });
      });
  }]);

perf.controller('TestChooserCtrl', function($scope, $modalInstance, $http,
                                            projects, optionCollectionMap,
                                            timeRange, thServiceDomain,
                                            seriesSummary, defaultProjectName,
                                            defaultPlatform) {
  $scope.timeRange = timeRange;
  $scope.projects = projects;
  if (defaultProjectName) {
    $scope.selectedProject = _.findWhere(projects, {name: defaultProjectName});
  } else {
    $scope.selectedProject = projects[0];
  }
  $scope.loadingTestData = false;

  var testInputCreated = false;

  $scope.addTestData = function () {
    var series = _.clone($scope.selectedSeries);
    series.projectName = $scope.selectedProject.name;
    $modalInstance.close(series);
  };

  $scope.cancel = function () {
    $modalInstance.dismiss('cancel');
  };

  $scope.updateTestInput = function() {
    $scope.addTestDataDisabled = true;
    $scope.loadingTestData = true;
    $scope.platformList = [];

    $http.get(thServiceDomain + '/api/project/' + $scope.selectedProject.name +
              '/performance-data/0/get_performance_series_summary/?interval=' +
              $scope.timeRange).then(
                function(response) {
                  var data = response.data;
                  var seriesList = [];
                  var i = 0;
                  Object.keys(data).forEach(function(signature) {
                    var series = seriesSummary(
                      signature, data[signature],
                      $scope.selectedProject.name, optionCollectionMap, i)

                    var platform = series.platform;
                    if ($scope.platformList.indexOf(platform) === -1) {
                      $scope.platformList.push(platform);
                    }

                    seriesList.push(series);

                    i++;
                  });
                  $scope.platformList.sort();
                  $scope.selectedPlatform = defaultPlatform ||
                    $scope.platformList[0];

                  $scope.updateTestSelector = function() {
                    var filteredSeriesList = seriesList.filter(
                      function(series) {
                        return (series.platform === $scope.selectedPlatform);
                      }).sort(function(a, b) { return a.name > b.name; });

                    var signatures = new Bloodhound({
                      datumTokenizer: Bloodhound.tokenizers.obj.whitespace('name'),
                      queryTokenizer: Bloodhound.tokenizers.whitespace,
                      limit: 100,
                      local: filteredSeriesList
                    });

                    // kicks off the loading/processing of `local` and `prefetch`
                    signatures.initialize();

                    if (testInputCreated) {
                      $('.typeahead').typeahead('destroy');
                    }

                    $('.typeahead').typeahead(null, {
                      name: 'signatures',
                      displayKey: 'name',
                      source: signatures.ttAdapter(),
                      limit: 100
                    }).on('typeahead:selected', function(obj, datum) {
                      $scope.selectedSeries = datum;
                      $scope.addTestDataDisabled = false;
                    });
                    testInputCreated = true;
                  }
                  $scope.updateTestSelector();

                  $scope.loadingTestData = false;
                });
  };

  $modalInstance.updateTestInput = $scope.updateTestInput;
});

perf.config(function($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.deferIntercept();

  $stateProvider.state('graphs', {
    templateUrl: 'partials/perf/perfctrl.html',
    url: '/graphs?timerange&series',
    controller: 'PerfCtrl'
  });

  $urlRouterProvider.otherwise('/graphs');
})
  // then define the interception
  .run(function ($rootScope, $urlRouter, $location, $state) {
    $rootScope.$on('$stateChangeStart', function(e, toState, toParams, fromState, fromParams) {
      console.log("state change start");
      console.log(fromParams);
      console.log(toParams);
      console.log($location)

      if (fromState && fromState.name === 'graphs') {
        // we're transitioning from graphs, prevent a full reinitialization
        //console.log("inhibiting state change transition");
        //e.preventDefault();
        //$urlRouter.sync();
      }
    });
    $rootScope.$on('$stateChangeSuccess', function(e, toState, toParams, fromState, fromParams) {
      console.log("stateChangeSuccess");
      console.log(fromParams);
      console.log(toParams);
      if (fromState && fromState.name === 'graphs') {
        // we're transitioning from graphs, prevent a full reinitialization
        console.log("inhibiting state change transition");
        e.preventDefault();
      }

    });
    $rootScope.$on('$locationChangeSuccess', function(e, newUrl, oldUrl) {
      
      // Prevent $urlRouter's default handler from firing
      e.preventDefault();
      console.log([newUrl, oldUrl]);
      console.log($state.current.name);
      if ($state.current.name !== 'graphs') {
        // your stuff
        console.log("syncin'");
        $urlRouter.sync();
      } else {
        // don't sync
        console.log("not syncin'");
      }

    });

    // Configures $urlRouter's listener *after* your custom listener
    $urlRouter.listen();
  })


