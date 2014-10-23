"use strict";

var perf = angular.module("perf", ['ui.router']);

perf.controller('PerfCtrl', [ '$stateParams', '$scope', '$rootScope', '$location',
  function PerfCtrl($stateParams, $scope, $rootScope, $location) {
    console.log($stateParams.projectId);
    $scope.repos = [
      { 'name': 'mozilla-central' },
      { 'name': 'mozilla-inbound' },
      { 'name': 'fx-team' },
      { 'name': 'holly' }
    ];
    $scope.repoName = $stateParams.projectId;

    var signatureMap = {};
    var signatures = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace('name'),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      limit: 10,
      prefetch: {
        url: '../api/project/' + $stateParams.projectId + '/performance-data/0/get_performance_series_summary/?interval=2592000',
        filter: function(data) {
          var list = [];
          Object.keys(data).forEach(function(key) {
            var signatureProps = data[key];
            var signatureName = signatureProps.suite + " " + signatureProps.test +
              " " + signatureProps.machine_platform + " " +
              signatureProps.machine_architecture;

            list.push({ name: signatureName, signature: key });
          });

          return list;
        }
      }
    });

    // kicks off the loading/processing of `local` and `prefetch`
    signatures.initialize();

    // passing in `null` for the `options` arguments will result in the default
    // options being used
    $('.typeahead').typeahead(null, {
      name: 'signatures',
      displayKey: 'name',
      // `ttAdapter` wraps the suggestion engine in an adapter that
      // is compatible with the typeahead jQuery plugin
      source: signatures.ttAdapter()
    }).on('typeahead:selected', function(obj, datum) {
      console.log(obj);
      console.log(datum);
      $.getJSON('../api/project/' + $stateParams.projectId + '/performance-data/0/get_performance_data/?interval_seconds=2592000&signatures=' + datum.signature, function(data) {
        console.log(data);

        var series = {
          lines: { show: true },
          points: { show: true },
          data: []
        }
        data[0].blob.forEach(function(dataPoint) {
          series.data.push([new Date(dataPoint.push_timestamp*1000), dataPoint.mean]);
          series.data.sort(function(a,b) { return a[0] < b[0]; });
        });
        console.log(series);
        var plot = $.plot($("#graph"), [ series ], {
          xaxis: {
            mode: "time",
            timeformat: "%m-%d"
          },
          yaxis: {
            axisLabel: 'Time',
            min: 0
          },
          grid: { clickable: true, hoverable: true },
          zoom: { interactive: true },
          pan: { interactive: true }
        });

      });

    });;
  }
]);

perf.config(function($stateProvider, $urlRouterProvider) {
  $stateProvider.state('projects', {
    templateUrl: 'graph.html',
    url: '/projects/:projectId',
    controller: 'PerfCtrl'
  });
});
