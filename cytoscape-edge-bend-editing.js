(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.cytoscapeEdgeBendEditing = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var debounce = _dereq_('./debounce');
var bendPointUtilities = _dereq_('./bendPointUtilities');
var registerUndoRedoFunctions = _dereq_('./registerUndoRedoFunctions');

module.exports = function (params, cy) {
  var fn = params;

  var addBendPointCxtMenuId = 'cy-edge-bend-editing-cxt-add-bend-point';
  var removeBendPointCxtMenuId = 'cy-edge-bend-editing-cxt-remove-bend-point';
  var ePosition, eStyle, eRemove, eAdd, eZoom, eSelect, eUnselect, eTapStart, eTapDrag, eTapEnd, eCxtTap;
  // last status of gestures
  var lastPanningEnabled, lastZoomingEnabled, lastBoxSelectionEnabled;
  // status of edge to highlight bends and selected edges
  var edgeToHighlightBends, numberOfSelectedEdges;
  
  var functions = {
    init: function () {
      // register undo redo functions
      registerUndoRedoFunctions(cy);
      
      var self = this;
      var opts = params;
      var $container = $(this);
      var $canvas = $('<canvas></canvas>');

      $container.append($canvas);

      var cxtAddBendPointFcn = function (event) {
        var edge = event.target || event.cyTarget;
        if(!bendPointUtilities.isIgnoredEdge(edge)) {

          var param = {
            edge: edge,
            weights: edge.data('cyedgebendeditingWeights') ? [].concat(edge.data('cyedgebendeditingWeights')) : edge.data('cyedgebendeditingWeights'),
            distances: edge.data('cyedgebendeditingDistances') ? [].concat(edge.data('cyedgebendeditingDistances')) : edge.data('cyedgebendeditingDistances')
          };

          bendPointUtilities.addBendPoint();

          if (options().undoable) {
            cy.undoRedo().do('changeBendPoints', param);
          }
        }
        
        refreshDraws();
      };

      var cxtRemoveBendPointFcn = function (event) {
        var edge = event.target || event.cyTarget;
        
        var param = {
          edge: edge,
          weights: [].concat(edge.data('cyedgebendeditingWeights')),
          distances: [].concat(edge.data('cyedgebendeditingDistances'))
        };

        bendPointUtilities.removeBendPoint();
        
        if(options().undoable) {
          cy.undoRedo().do('changeBendPoints', param);
        }
        
        refreshDraws();
      };
      
      var menuItems = [
        {
          id: addBendPointCxtMenuId,
          title: opts.addBendMenuItemTitle,
          content: 'Add Bend Point',
          selector: 'edge',
          onClickFunction: cxtAddBendPointFcn
        },
        {
          id: removeBendPointCxtMenuId,
          title: opts.removeBendMenuItemTitle,
          content: 'Remove Bend Point',
          selector: 'edge',
          onClickFunction: cxtRemoveBendPointFcn
        }
      ];
      
      if(cy.contextMenus) {
        var menus = cy.contextMenus('get');
        // If context menus is active just append menu items else activate the extension
        // with initial menu items
        if (menus.isActive()) {
          menus.appendMenuItems(menuItems);
        }
        else {
          cy.contextMenus({
            menuItems: menuItems
          });
        }
      }
      
      var _sizeCanvas = debounce(function () {
        $canvas
          .attr('height', $container.height())
          .attr('width', $container.width())
          .css({
            'position': 'absolute',
            'top': 0,
            'left': 0,
            'z-index': '999'
          })
        ;

        setTimeout(function () {
          var canvasBb = $canvas.offset();
          var containerBb = $container.offset();

          $canvas
            .css({
              'top': -(canvasBb.top - containerBb.top),
              'left': -(canvasBb.left - containerBb.left)
            })
          ;

          // redraw on canvas resize
          if(cy){
            refreshDraws();
          }
        }, 0);

      }, 250);

      function sizeCanvas() {
        _sizeCanvas();
      }

      sizeCanvas();

      $(window).bind('resize', function () {
        sizeCanvas();
      });

      var ctx = $canvas[0].getContext('2d');

      // write options to data
      var data = $container.data('cyedgebendediting');
      if (data == null) {
        data = {};
      }
      data.options = opts;

      var optCache;

      function options() {
        return optCache || (optCache = $container.data('cyedgebendediting').options);
      }
      
      // we will need to convert model positons to rendered positions
      function convertToRenderedPosition(modelPosition) {
        var pan = cy.pan();
        var zoom = cy.zoom();

        var x = modelPosition.x * zoom + pan.x;
        var y = modelPosition.y * zoom + pan.y;

        return {
          x: x,
          y: y
        };
      }
      
      function refreshDraws() {

        var w = $container.width();
        var h = $container.height();

        ctx.clearRect(0, 0, w, h);
        
        if( edgeToHighlightBends ) {
          renderBendShapes(edgeToHighlightBends);
        }
      }
      
      
      // render the bend shapes of the given edge
      function renderBendShapes(edge) {
        
        if(!edge.hasClass('edgebendediting-hasbendpoints')) {
          return;
        }
        
        var segpts = bendPointUtilities.getSegmentPoints(edge);//edge._private.rdata.segpts;
        var length = getBendShapesLenght(edge);
        
        var srcPos = edge.source().position();
        var tgtPos = edge.target().position();
        
        var weights = edge.data('cyedgebendeditingWeights');
        var distances = edge.data('cyedgebendeditingDistances');

        for(var i = 0; segpts && i < segpts.length; i = i + 2){
          var bendX = segpts[i];
          var bendY = segpts[i + 1];

          var oldStyle = ctx.fillStyle;
          ctx.fillStyle = edge.css('line-color');
          renderBendShape(bendX, bendY, length);
          ctx.fillStyle = oldStyle;
        }
      }
      
      // render a bend shape with the given parameters
      function renderBendShape(bendX, bendY, length) {
        // get the top left coordinates
        var topLeftX = bendX - length / 2;
        var topLeftY = bendY - length / 2;
        
        // convert to rendered parameters
        var renderedTopLeftPos = convertToRenderedPosition({x: topLeftX, y: topLeftY});
        length *= cy.zoom();
        
        // render bend shape
        ctx.beginPath();
        ctx.rect(renderedTopLeftPos.x, renderedTopLeftPos.y, length, length);
        ctx.fill();
        ctx.closePath();
      }
      
      // get the length of bend points to be rendered
      function getBendShapesLenght(edge) {
        var factor = options().bendShapeSizeFactor;
        if (parseFloat(edge.css('width')) <= 2.5)
          return 2.5 * factor;
        else return parseFloat(edge.css('width'))*factor;
      }
      
      // check if the point represented by {x, y} is inside the bend shape
      function checkIfInsideBendShape(x, y, length, centerX, centerY){
        var minX = centerX - length / 2;
        var maxX = centerX + length / 2;
        var minY = centerY - length / 2;
        var maxY = centerY + length / 2;
        
        var inside = (x >= minX && x <= maxX) && (y >= minY && y <= maxY);
        return inside;
      }

      // get the index of bend point containing the point represented by {x, y}
      function getContainingBendShapeIndex(x, y, edge) {
        if(edge.data('cyedgebendeditingWeights') == null || edge.data('cyedgebendeditingWeights').length == 0){
          return -1;
        }

        var segpts = bendPointUtilities.getSegmentPoints(edge);//edge._private.rdata.segpts;
        var length = getBendShapesLenght(edge);

        for(var i = 0; segpts && i < segpts.length; i = i + 2){
          var bendX = segpts[i];
          var bendY = segpts[i + 1];

          var inside = checkIfInsideBendShape(x, y, length, bendX, bendY);
          if(inside){
            return i / 2;
          }
        }

        return -1;
      };
      
      // store the current status of gestures and set them to false
      function disableGestures() {
        lastPanningEnabled = cy.panningEnabled();
        lastZoomingEnabled = cy.zoomingEnabled();
        lastBoxSelectionEnabled = cy.boxSelectionEnabled();

        cy.zoomingEnabled(false)
          .panningEnabled(false)
          .boxSelectionEnabled(false);
      }
      
      // reset the gestures by their latest status
      function resetGestures() {
        cy.zoomingEnabled(lastZoomingEnabled)
          .panningEnabled(lastPanningEnabled)
          .boxSelectionEnabled(lastBoxSelectionEnabled);
      }

      // get the movebend params from an edge
      function getMoveBendParams(edge) {
        return {
          edge: edge,
          weights: edge.data('cyedgebendeditingWeights') ? [].concat(edge.data('cyedgebendeditingWeights')) : [],
          distances: edge.data('cyedgebendeditingDistances') ? [].concat(edge.data('cyedgebendeditingDistances')) : []
        };
      }
      
      {  
        lastPanningEnabled = cy.panningEnabled();
        lastZoomingEnabled = cy.zoomingEnabled();
        lastBoxSelectionEnabled = cy.boxSelectionEnabled();
        
        // Initilize the edgeToHighlightBends and numberOfSelectedEdges
        {
          var selectedEdges = cy.edges(':selected');
          var numberOfSelectedEdges = selectedEdges.length;
          
          if ( numberOfSelectedEdges === 1 ) {
            edgeToHighlightBends = selectedEdges[0];
          }
        }
        
        cy.bind('zoom pan', eZoom = function () {
          if ( !edgeToHighlightBends ) {
            return;
          }
          
          refreshDraws();
        });

        cy.on('position', 'node', ePosition = function () {
          var node = this;
          
          // If there is no edge to highlight bends or this node is not any end of that edge return directly
          if ( !edgeToHighlightBends || !( edgeToHighlightBends.data('source') === node.id() 
                  || edgeToHighlightBends.data('target') === node.id() ) ) {
            return;
          }
          
          refreshDraws();
        });

        cy.on('style', 'edge.edgebendediting-hasbendpoints:selected', eStyle = function () {
          refreshDraws();
        });

        cy.on('remove', 'edge', eRemove = function () {
          var edge = this;
          if (edge.selected()) {
            numberOfSelectedEdges = numberOfSelectedEdges - 1;
            
            cy.startBatch();
            
            if (edgeToHighlightBends) {
              edgeToHighlightBends.removeClass('cy-edge-bend-editing-highlight-bends');
            }
            
            if (numberOfSelectedEdges === 1) {
              var selectedEdges = cy.edges(':selected');
              
              // If user removes all selected edges at a single operation then our 'numberOfSelectedEdges'
              // may be misleading. Therefore we need to check if the number of edges to highlight is realy 1 here.
              if (selectedEdges.length === 1) {
                edgeToHighlightBends = selectedEdges[0];
                edgeToHighlightBends.addClass('cy-edge-bend-editing-highlight-bends');
              }
              else {
                edgeToHighlightBends = undefined;
              }
            }
            else {
              edgeToHighlightBends = undefined;
            }
            
            cy.endBatch();
          }
          refreshDraws();
        });
        
         cy.on('add', 'edge', eAdd = function () {
          var edge = this;
          if (edge.selected()) {
            numberOfSelectedEdges = numberOfSelectedEdges + 1;
            
            cy.startBatch();
            
            if (edgeToHighlightBends) {
              edgeToHighlightBends.removeClass('cy-edge-bend-editing-highlight-bends');
            }
            
            if (numberOfSelectedEdges === 1) {
              edgeToHighlightBends = edge;
              edgeToHighlightBends.addClass('cy-edge-bend-editing-highlight-bends');
            }
            else {
              edgeToHighlightBends = undefined;
            }
            
            cy.endBatch();
          }
          refreshDraws();
        });
        
        cy.on('select', 'edge', eSelect = function () {
          var edge = this;
          numberOfSelectedEdges = numberOfSelectedEdges + 1;
          
          cy.startBatch();
            
          if (edgeToHighlightBends) {
            edgeToHighlightBends.removeClass('cy-edge-bend-editing-highlight-bends');
          }
            
          if (numberOfSelectedEdges === 1) {
            edgeToHighlightBends = edge;
            edgeToHighlightBends.addClass('cy-edge-bend-editing-highlight-bends');
          }
          else {
            edgeToHighlightBends = undefined;
          }
          
          cy.endBatch();
          refreshDraws();
        });
        
        cy.on('unselect', 'edge', eUnselect = function () {
          numberOfSelectedEdges = numberOfSelectedEdges - 1;
            
          cy.startBatch();
            
          if (edgeToHighlightBends) {
            edgeToHighlightBends.removeClass('cy-edge-bend-editing-highlight-bends');
          }
            
          if (numberOfSelectedEdges === 1) {
            var selectedEdges = cy.edges(':selected');
            
            // If user unselects all edges by tapping to the core etc. then our 'numberOfSelectedEdges'
            // may be misleading. Therefore we need to check if the number of edges to highlight is realy 1 here.
            if (selectedEdges.length === 1) {
              edgeToHighlightBends = selectedEdges[0];
              edgeToHighlightBends.addClass('cy-edge-bend-editing-highlight-bends');
            }
            else {
              edgeToHighlightBends = undefined;
            }
          }
          else {
            edgeToHighlightBends = undefined;
          }
          
          cy.endBatch();
          refreshDraws();
        });
        
        var movedBendIndex;
        var movedBendEdge;
        var moveBendParam;
        var createBendOnDrag;
        
        cy.on('tapstart', 'edge', eTapStart = function (event) {
          var edge = this;
          
          if (!edgeToHighlightBends || edgeToHighlightBends.id() !== edge.id()) {
            createBendOnDrag = false;
            return;
          }
          
          movedBendEdge = edge;
          moveBendParam = getMoveBendParams(edgeToHighlightBends);
          
          var cyPos = event.position || event.cyPosition;
          var cyPosX = cyPos.x;
          var cyPosY = cyPos.y;

          var index = getContainingBendShapeIndex(cyPosX, cyPosY, edge);
          if (index != -1) {
            var curveStyle = edge.css('curve-style');
            if(curveStyle !== 'unbundled-bezier') {
              movedBendIndex = index;
              disableGestures();
            }
          }
          else {
            createBendOnDrag = true;
          }
        });

        cy.on('tapstart', eTapStart = function (event) {
          if(edgeToHighlightBends) {
            var curveStyle = edgeToHighlightBends.css('curve-style');
            if(curveStyle === 'unbundled-bezier') {
              var cyPos = event.position || event.cyPosition;
              var index = getContainingBendShapeIndex(cyPos.x, cyPos.y, edgeToHighlightBends);
              if (index != -1) {
                movedBendEdge = edgeToHighlightBends;
                moveBendParam = getMoveBendParams(edgeToHighlightBends);
                movedBendIndex = index;
                disableGestures();
              }
            }
          }
        });

        cy.on('tapdrag', eTapDrag = function (event) {
          var edge = movedBendEdge;
          if(movedBendEdge !== undefined && bendPointUtilities.isIgnoredEdge(edge) ) {
            return;
          }
          
          if(createBendOnDrag) {
            var cyPos = event.position || event.cyPosition;
            bendPointUtilities.addBendPoint(edge, cyPos);
            movedBendIndex = getContainingBendShapeIndex(cyPos.x, cyPos.y, edge);
            movedBendEdge = edge;
            createBendOnDrag = undefined;
            disableGestures();
          }
          
          if (movedBendEdge === undefined || movedBendIndex === undefined) {
            return;
          }

          var weights = edge.data('cyedgebendeditingWeights');
          var distances = edge.data('cyedgebendeditingDistances');

          var relativeBendPosition = bendPointUtilities.convertToRelativeBendPosition(edge, event.position || event.cyPosition);
          weights[movedBendIndex] = relativeBendPosition.weight;
          distances[movedBendIndex] = relativeBendPosition.distance;

          edge.data('cyedgebendeditingWeights', weights);
          edge.data('cyedgebendeditingDistances', distances);
          
          refreshDraws();
        });
        
        cy.on('tapend', eTapEnd = function (event) {
          var edge = movedBendEdge;
          
          if( edge !== undefined ) {
            if( movedBendIndex != undefined ) {
              var startX = edge.source().position('x');
              var startY = edge.source().position('y');
              var endX = edge.target().position('x');
              var endY = edge.target().position('y');
              
              var segPts = bendPointUtilities.getSegmentPoints(edge);
              var allPts = [startX, startY].concat(segPts).concat([endX, endY]);
              
              var pointIndex = movedBendIndex + 1;
              var preIndex = pointIndex - 1;
              var posIndex = pointIndex + 1;
              
              var point = {
                x: allPts[2 * pointIndex],
                y: allPts[2 * pointIndex + 1]
              };
              
              var prePoint = {
                x: allPts[2 * preIndex],
                y: allPts[2 * preIndex + 1]
              };
              
              var posPoint = {
                x: allPts[2 * posIndex],
                y: allPts[2 * posIndex + 1]
              };
              
              var nearToLine;
              
              if( ( point.x === prePoint.x && point.y === prePoint.y ) || ( point.x === prePoint.x && point.y === prePoint.y ) ) {
                nearToLine = true;
              }
              else {
                var m1 = ( prePoint.y - posPoint.y ) / ( prePoint.x - posPoint.x );
                var m2 = -1 / m1;

                var srcTgtPointsAndTangents = {
                  srcPoint: prePoint,
                  tgtPoint: posPoint,
                  m1: m1,
                  m2: m2
                };

                //get the intersection of the current segment with the new bend point
                var currentIntersection = bendPointUtilities.getIntersection(edge, point, srcTgtPointsAndTangents);
                var dist = Math.sqrt( Math.pow( (point.x - currentIntersection.x), 2 ) 
                        + Math.pow( (point.y - currentIntersection.y), 2 ));
                
//                var length = Math.sqrt( Math.pow( (posPoint.x - prePoint.x), 2 ) 
//                        + Math.pow( (posPoint.y - prePoint.y), 2 ));
                
                if( dist  < 8 ) {
                  nearToLine = true;
                }
                
              }
              
              if( nearToLine )
              {
                bendPointUtilities.removeBendPoint(edge, movedBendIndex);
              }
              
            }
          }
          
          if (edge !== undefined && moveBendParam !== undefined && edge.data('cyedgebendeditingWeights')
                  && edge.data('cyedgebendeditingWeights').toString() != moveBendParam.weights.toString()) {
            
            if(options().undoable) {
              cy.undoRedo().do('changeBendPoints', moveBendParam);
            }
          }

          movedBendIndex = undefined;
          movedBendEdge = undefined;
          moveBendParam = undefined;
          createBendOnDrag = undefined;

          resetGestures();
          refreshDraws();
        });
        
        cy.on('cxttap', 'edge', eCxtTap = function (event) {
          var edge = this;
          
          var menus = cy.contextMenus('get'); // get context menus instance
          
          if(!edgeToHighlightBends || edgeToHighlightBends.id() != edge.id() || bendPointUtilities.isIgnoredEdge(edge)) {
            menus.hideMenuItem(removeBendPointCxtMenuId);
            menus.hideMenuItem(addBendPointCxtMenuId);
            return;
          }

          var cyPos = event.position || event.cyPosition;
          var selectedBendIndex = getContainingBendShapeIndex(cyPos.x, cyPos.y, edge);
          if (selectedBendIndex == -1) {
            menus.hideMenuItem(removeBendPointCxtMenuId);
            menus.showMenuItem(addBendPointCxtMenuId);
            bendPointUtilities.currentCtxPos = cyPos;
          }
          else {
            menus.hideMenuItem(addBendPointCxtMenuId);
            menus.showMenuItem(removeBendPointCxtMenuId);
            bendPointUtilities.currentBendIndex = selectedBendIndex;
          }

          bendPointUtilities.currentCtxEdge = edge;
        });
        
        cy.on('cyedgebendediting.changeBendPoints', 'edge', function() {
          var edge = this;
          cy.startBatch();
          cy.edges().unselect();
          edge.select();
          cy.endBatch();
          refreshDraws();
        });
      }

      $container.data('cyedgebendediting', data);
    },
    unbind: function () {
        cy.off('position', 'node', ePosition)
          .off('remove', 'node', eRemove)
          .off('add', 'node', eAdd)
          .off('style', 'edge.edgebendediting-hasbendpoints:selected', eStyle)
          .off('select', 'edge', eSelect)
          .off('unselect', 'edge', eUnselect)
          .off('tapstart', 'edge', eTapStart)
          .off('tapdrag', eTapDrag)
          .off('tapend', eTapEnd)
          .off('cxttap', eCxtTap);

        cy.unbind("zoom pan", eZoom);
    }
  };

  if (functions[fn]) {
    return functions[fn].apply($(cy.container()), Array.prototype.slice.call(arguments, 1));
  } else if (typeof fn == 'object' || !fn) {
    return functions.init.apply($(cy.container()), arguments);
  } else {
    $.error('No such function `' + fn + '` for cytoscape.js-edge-bend-editing');
  }

  return $(this);
};

},{"./bendPointUtilities":2,"./debounce":3,"./registerUndoRedoFunctions":5}],2:[function(_dereq_,module,exports){
var bendPointUtilities = {
  currentCtxEdge: undefined,
  currentCtxPos: undefined,
  currentBendIndex: undefined,
  ignoredClasses: undefined,
  setIgnoredClasses: function(_ignoredClasses) {
    this.ignoredClasses = _ignoredClasses;
  },
  // initilize bend points based on bendPositionsFcn
  initBendPoints: function(bendPositionsFcn, edges) {
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      if(!this.isIgnoredEdge(edge)) {

        // get the bend positions by applying the function for this edge
        var bendPositions = bendPositionsFcn.apply(this, edge);
        // calculate relative bend positions
        var result = this.convertToRelativeBendPositions(edge, bendPositions);

        // if there are bend points set weights and distances accordingly and add class to enable style changes
        if (result.distances.length > 0) {
          edge.data('cyedgebendeditingWeights', result.weights);
          edge.data('cyedgebendeditingDistances', result.distances);
          edge.addClass('edgebendediting-hasbendpoints');
        }
      }
    }
  },

  isIgnoredEdge: function(edge) {
    for(var i = 0; this.ignoredClasses && i <  this.ignoredClasses.length; i++){
      if(edge.hasClass(this.ignoredClasses[i]))
        return true;
    }
    return false;
  },
  //Get the direction of the line from source point to the target point
  getLineDirection: function(srcPoint, tgtPoint){
    if(srcPoint.y == tgtPoint.y && srcPoint.x < tgtPoint.x){
      return 1;
    }
    if(srcPoint.y < tgtPoint.y && srcPoint.x < tgtPoint.x){
      return 2;
    }
    if(srcPoint.y < tgtPoint.y && srcPoint.x == tgtPoint.x){
      return 3;
    }
    if(srcPoint.y < tgtPoint.y && srcPoint.x > tgtPoint.x){
      return 4;
    }
    if(srcPoint.y == tgtPoint.y && srcPoint.x > tgtPoint.x){
      return 5;
    }
    if(srcPoint.y > tgtPoint.y && srcPoint.x > tgtPoint.x){
      return 6;
    }
    if(srcPoint.y > tgtPoint.y && srcPoint.x == tgtPoint.x){
      return 7;
    }
    return 8;//if srcPoint.y > tgtPoint.y and srcPoint.x < tgtPoint.x
  },
  getSrcTgtPointsAndTangents: function (edge) {
    var sourceNode = edge.source();
    var targetNode = edge.target();
    
    var tgtPosition = targetNode.position();
    var srcPosition = sourceNode.position();
    
    var srcPoint = sourceNode.position();
    var tgtPoint = targetNode.position();


    var m1 = (tgtPoint.y - srcPoint.y) / (tgtPoint.x - srcPoint.x);
    var m2 = -1 / m1;

    return {
      m1: m1,
      m2: m2,
      srcPoint: srcPoint,
      tgtPoint: tgtPoint
    };
  },
  getIntersection: function(edge, point, srcTgtPointsAndTangents){
    if (srcTgtPointsAndTangents === undefined) {
      srcTgtPointsAndTangents = this.getSrcTgtPointsAndTangents(edge);
    }

    var srcPoint = srcTgtPointsAndTangents.srcPoint;
    var tgtPoint = srcTgtPointsAndTangents.tgtPoint;
    var m1 = srcTgtPointsAndTangents.m1;
    var m2 = srcTgtPointsAndTangents.m2;

    var intersectX;
    var intersectY;

    if(m1 == Infinity || m1 == -Infinity){
      intersectX = srcPoint.x;
      intersectY = point.y;
    }
    else if(m1 == 0){
      intersectX = point.x;
      intersectY = srcPoint.y;
    }
    else {
      var a1 = srcPoint.y - m1 * srcPoint.x;
      var a2 = point.y - m2 * point.x;

      intersectX = (a2 - a1) / (m1 - m2);
      intersectY = m1 * intersectX + a1;
    }

    //Intersection point is the intersection of the lines passing through the nodes and
    //passing through the bend point and perpendicular to the other line
    var intersectionPoint = {
      x: intersectX,
      y: intersectY
    };
    
    return intersectionPoint;
  },
  getSegmentPoints: function(edge) {
    var curveStyle = edge.css('curve-style');
    if( curveStyle !== 'segments' && curveStyle !== 'unbundled-bezier' ) {
      return undefined;
    }
    
    var segpts = [];

    var segmentWs = edge.pstyle( this.getWeightsName(curveStyle) ).pfValue;
    var segmentDs = edge.pstyle( this.getDistancesName(curveStyle) ).pfValue;
    var segmentsN = Math.min( segmentWs.length, segmentDs.length );
    
    var srcPos = edge.source().position();
    var tgtPos = edge.target().position();

    var dy = ( tgtPos.y - srcPos.y );
    var dx = ( tgtPos.x - srcPos.x );
    
    var l = Math.sqrt( dx * dx + dy * dy );

    var vector = {
      x: dx,
      y: dy
    };

    var vectorNorm = {
      x: vector.x / l,
      y: vector.y / l
    };
    
    var vectorNormInverse = {
      x: -vectorNorm.y,
      y: vectorNorm.x
    };

    for( var s = 0; s < segmentsN; s++ ){
      var w = segmentWs[ s ];
      var d = segmentDs[ s ];

      // d = swappedDirection ? -d : d;
      //
      // d = Math.abs(d);

      // var w1 = !swappedDirection ? (1 - w) : w;
      // var w2 = !swappedDirection ? w : (1 - w);

      var w1 = (1 - w);
      var w2 = w;

      var posPts = {
        x1: srcPos.x,
        x2: tgtPos.x,
        y1: srcPos.y,
        y2: tgtPos.y
      };

      var midptPts = posPts;
      
      

      var adjustedMidpt = {
        x: midptPts.x1 * w1 + midptPts.x2 * w2,
        y: midptPts.y1 * w1 + midptPts.y2 * w2
      };

      segpts.push(
        adjustedMidpt.x + vectorNormInverse.x * d,
        adjustedMidpt.y + vectorNormInverse.y * d
      );
    }
    
    return segpts;
  },
  convertToRelativeBendPosition: function (edge, bendPoint, srcTgtPointsAndTangents) {
    if (srcTgtPointsAndTangents === undefined) {
      srcTgtPointsAndTangents = this.getSrcTgtPointsAndTangents(edge);
    }
    
    var intersectionPoint = this.getIntersection(edge, bendPoint, srcTgtPointsAndTangents);
    var intersectX = intersectionPoint.x;
    var intersectY = intersectionPoint.y;
    
    var srcPoint = srcTgtPointsAndTangents.srcPoint;
    var tgtPoint = srcTgtPointsAndTangents.tgtPoint;
    
    var weight;
    
    if( intersectX != srcPoint.x ) {
      weight = (intersectX - srcPoint.x) / (tgtPoint.x - srcPoint.x);
    }
    else if( intersectY != srcPoint.y ) {
      weight = (intersectY - srcPoint.y) / (tgtPoint.y - srcPoint.y);
    }
    else {
      weight = 0;
    }
    
    var distance = Math.sqrt(Math.pow((intersectY - bendPoint.y), 2)
        + Math.pow((intersectX - bendPoint.x), 2));
    
    //Get the direction of the line form source point to target point
    var direction1 = this.getLineDirection(srcPoint, tgtPoint);
    //Get the direction of the line from intesection point to bend point
    var direction2 = this.getLineDirection(intersectionPoint, bendPoint);
    
    //If the difference is not -2 and not 6 then the direction of the distance is negative
    if(direction1 - direction2 != -2 && direction1 - direction2 != 6){
      if(distance != 0)
        distance = -1 * distance;
    }
    
    return {
      weight: weight,
      distance: distance
    };
  },
  convertToRelativeBendPositions: function (edge, bendPoints) {
    var srcTgtPointsAndTangents = this.getSrcTgtPointsAndTangents(edge);
//    var bendPoints = edge.data('bendPointPositions');
    //output variables
    var weights = [];
    var distances = [];

    for (var i = 0; bendPoints && i < bendPoints.length; i++) {
      var bendPoint = bendPoints[i];
      var relativeBendPosition = this.convertToRelativeBendPosition(edge, bendPoint, srcTgtPointsAndTangents);

      weights.push(relativeBendPosition.weight);
      distances.push(relativeBendPosition.distance);
    }

    return {
      weights: weights,
      distances: distances
    };
  },
  getSegmentDistancesString: function (edge) {
    var str = "";

    var distances = edge.data('cyedgebendeditingDistances');
    for (var i = 0; distances && i < distances.length; i++) {
      str = str + " " + distances[i];
    }
    
    return str;
  },
  getSegmentWeightsString: function (edge) {
    var str = "";

    var weights = edge.data('cyedgebendeditingWeights');
    for (var i = 0; weights && i < weights.length; i++) {
      str = str + " " + weights[i];
    }
    
    return str;
  },
  addBendPoint: function(edge, newBendPoint) {
    if(edge === undefined || newBendPoint === undefined){
      edge = this.currentCtxEdge;
      newBendPoint = this.currentCtxPos;
    }
    
    var relativeBendPosition = this.convertToRelativeBendPosition(edge, newBendPoint);
    var originalPointWeight = relativeBendPosition.weight;
    
    var startX = edge.source().position('x');
    var startY = edge.source().position('y');
    var endX = edge.target().position('x');
    var endY = edge.target().position('y');
    
    var startWeight = this.convertToRelativeBendPosition(edge, {x: startX, y: startY}).weight;
    var endWeight = this.convertToRelativeBendPosition(edge, {x: endX, y: endY}).weight;
    var weightsWithTgtSrc = [startWeight].concat(edge.data('cyedgebendeditingWeights')?edge.data('cyedgebendeditingWeights'):[]).concat([endWeight]);
    
    var segPts = this.getSegmentPoints(edge);
    
    var minDist = Infinity;
    var intersection;
    var segptsWithTgtSrc = [startX, startY]
            .concat(segPts?segPts:[])
            .concat([endX, endY]);
    var newBendIndex = -1;
    
    for(var i = 0; i < weightsWithTgtSrc.length - 1; i++){
      var w1 = weightsWithTgtSrc[i];
      var w2 = weightsWithTgtSrc[i + 1];
      
      //check if the weight is between w1 and w2
      if((originalPointWeight <= w1 && originalPointWeight >= w2) || (originalPointWeight <= w2 && originalPointWeight >= w1)){
        var startX = segptsWithTgtSrc[2 * i];
        var startY = segptsWithTgtSrc[2 * i + 1];
        var endX = segptsWithTgtSrc[2 * i + 2];
        var endY = segptsWithTgtSrc[2 * i + 3];
        
        var start = {
          x: startX,
          y: startY
        };
        
        var end = {
          x: endX,
          y: endY
        };
        
        var m1 = ( startY - endY ) / ( startX - endX );
        var m2 = -1 / m1;
        
        var srcTgtPointsAndTangents = {
          srcPoint: start,
          tgtPoint: end,
          m1: m1,
          m2: m2
        };
        
        //get the intersection of the current segment with the new bend point
        var currentIntersection = this.getIntersection(edge, newBendPoint, srcTgtPointsAndTangents);
        var dist = Math.sqrt( Math.pow( (newBendPoint.x - currentIntersection.x), 2 ) 
                + Math.pow( (newBendPoint.y - currentIntersection.y), 2 ));
        
        //Update the minimum distance
        if(dist < minDist){
          minDist = dist;
          intersection = currentIntersection;
          newBendIndex = i;
        }
      }
    }
    
    if(intersection !== undefined){
      newBendPoint = intersection;
    }
    
    relativeBendPosition = this.convertToRelativeBendPosition(edge, newBendPoint);
    
    if(intersection === undefined){
      relativeBendPosition.distance = 0;
    }

    var weights = edge.data('cyedgebendeditingWeights');
    var distances = edge.data('cyedgebendeditingDistances');
    
    weights = weights?weights:[];
    distances = distances?distances:[];
    
    if(weights.length === 0) {
      newBendIndex = 0;
    }
    
//    weights.push(relativeBendPosition.weight);
//    distances.push(relativeBendPosition.distance);
    if(newBendIndex != -1){
      weights.splice(newBendIndex, 0, relativeBendPosition.weight);
      distances.splice(newBendIndex, 0, relativeBendPosition.distance);
    }
   
    edge.data('cyedgebendeditingWeights', weights);
    edge.data('cyedgebendeditingDistances', distances);
    
    edge.addClass('edgebendediting-hasbendpoints');
    
    return relativeBendPosition;
  },
  removeBendPoint: function(edge, bendPointIndex){
    if(edge === undefined || bendPointIndex === undefined){
      edge = this.currentCtxEdge;
      bendPointIndex = this.currentBendIndex;
    }
    
    var distances = edge.data('cyedgebendeditingDistances');
    var weights = edge.data('cyedgebendeditingWeights');
    
    distances.splice(bendPointIndex, 1);
    weights.splice(bendPointIndex, 1);
    
    
    if(distances.length == 0 || weights.length == 0){
      edge.removeClass('edgebendediting-hasbendpoints');
    }
    else {
      edge.data('cyedgebendeditingDistances', distances);
      edge.data('cyedgebendeditingWeights', weights);
    }
  },
  calculateDistance: function(pt1, pt2) {
    var diffX = pt1.x - pt2.x;
    var diffY = pt1.y - pt2.y;
    
    var dist = Math.sqrt( Math.pow( diffX, 2 ) + Math.pow( diffY, 2 ) );
    return dist;
  },
  getWeightsName: function(curveStyle) {
    return curveStyle === 'segments' ? 'segment-weights' : 'control-point-weights';
  },
  getDistancesName: function(curveStyle) {
    return curveStyle === 'segments' ? 'segment-distances' : 'control-point-distances';
  }
};

module.exports = bendPointUtilities;

},{}],3:[function(_dereq_,module,exports){
var debounce = (function () {
  /**
   * lodash 3.1.1 (Custom Build) <https://lodash.com/>
   * Build: `lodash modern modularize exports="npm" -o ./`
   * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
   * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
   * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
   * Available under MIT license <https://lodash.com/license>
   */
  /** Used as the `TypeError` message for "Functions" methods. */
  var FUNC_ERROR_TEXT = 'Expected a function';

  /* Native method references for those with the same name as other `lodash` methods. */
  var nativeMax = Math.max,
          nativeNow = Date.now;

  /**
   * Gets the number of milliseconds that have elapsed since the Unix epoch
   * (1 January 1970 00:00:00 UTC).
   *
   * @static
   * @memberOf _
   * @category Date
   * @example
   *
   * _.defer(function(stamp) {
   *   console.log(_.now() - stamp);
   * }, _.now());
   * // => logs the number of milliseconds it took for the deferred function to be invoked
   */
  var now = nativeNow || function () {
    return new Date().getTime();
  };

  /**
   * Creates a debounced function that delays invoking `func` until after `wait`
   * milliseconds have elapsed since the last time the debounced function was
   * invoked. The debounced function comes with a `cancel` method to cancel
   * delayed invocations. Provide an options object to indicate that `func`
   * should be invoked on the leading and/or trailing edge of the `wait` timeout.
   * Subsequent calls to the debounced function return the result of the last
   * `func` invocation.
   *
   * **Note:** If `leading` and `trailing` options are `true`, `func` is invoked
   * on the trailing edge of the timeout only if the the debounced function is
   * invoked more than once during the `wait` timeout.
   *
   * See [David Corbacho's article](http://drupalmotion.com/article/debounce-and-throttle-visual-explanation)
   * for details over the differences between `_.debounce` and `_.throttle`.
   *
   * @static
   * @memberOf _
   * @category Function
   * @param {Function} func The function to debounce.
   * @param {number} [wait=0] The number of milliseconds to delay.
   * @param {Object} [options] The options object.
   * @param {boolean} [options.leading=false] Specify invoking on the leading
   *  edge of the timeout.
   * @param {number} [options.maxWait] The maximum time `func` is allowed to be
   *  delayed before it's invoked.
   * @param {boolean} [options.trailing=true] Specify invoking on the trailing
   *  edge of the timeout.
   * @returns {Function} Returns the new debounced function.
   * @example
   *
   * // avoid costly calculations while the window size is in flux
   * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
   *
   * // invoke `sendMail` when the click event is fired, debouncing subsequent calls
   * jQuery('#postbox').on('click', _.debounce(sendMail, 300, {
   *   'leading': true,
   *   'trailing': false
   * }));
   *
   * // ensure `batchLog` is invoked once after 1 second of debounced calls
   * var source = new EventSource('/stream');
   * jQuery(source).on('message', _.debounce(batchLog, 250, {
   *   'maxWait': 1000
   * }));
   *
   * // cancel a debounced call
   * var todoChanges = _.debounce(batchLog, 1000);
   * Object.observe(models.todo, todoChanges);
   *
   * Object.observe(models, function(changes) {
   *   if (_.find(changes, { 'user': 'todo', 'type': 'delete'})) {
   *     todoChanges.cancel();
   *   }
   * }, ['delete']);
   *
   * // ...at some point `models.todo` is changed
   * models.todo.completed = true;
   *
   * // ...before 1 second has passed `models.todo` is deleted
   * // which cancels the debounced `todoChanges` call
   * delete models.todo;
   */
  function debounce(func, wait, options) {
    var args,
            maxTimeoutId,
            result,
            stamp,
            thisArg,
            timeoutId,
            trailingCall,
            lastCalled = 0,
            maxWait = false,
            trailing = true;

    if (typeof func != 'function') {
      throw new TypeError(FUNC_ERROR_TEXT);
    }
    wait = wait < 0 ? 0 : (+wait || 0);
    if (options === true) {
      var leading = true;
      trailing = false;
    } else if (isObject(options)) {
      leading = !!options.leading;
      maxWait = 'maxWait' in options && nativeMax(+options.maxWait || 0, wait);
      trailing = 'trailing' in options ? !!options.trailing : trailing;
    }

    function cancel() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId);
      }
      lastCalled = 0;
      maxTimeoutId = timeoutId = trailingCall = undefined;
    }

    function complete(isCalled, id) {
      if (id) {
        clearTimeout(id);
      }
      maxTimeoutId = timeoutId = trailingCall = undefined;
      if (isCalled) {
        lastCalled = now();
        result = func.apply(thisArg, args);
        if (!timeoutId && !maxTimeoutId) {
          args = thisArg = undefined;
        }
      }
    }

    function delayed() {
      var remaining = wait - (now() - stamp);
      if (remaining <= 0 || remaining > wait) {
        complete(trailingCall, maxTimeoutId);
      } else {
        timeoutId = setTimeout(delayed, remaining);
      }
    }

    function maxDelayed() {
      complete(trailing, timeoutId);
    }

    function debounced() {
      args = arguments;
      stamp = now();
      thisArg = this;
      trailingCall = trailing && (timeoutId || !leading);

      if (maxWait === false) {
        var leadingCall = leading && !timeoutId;
      } else {
        if (!maxTimeoutId && !leading) {
          lastCalled = stamp;
        }
        var remaining = maxWait - (stamp - lastCalled),
                isCalled = remaining <= 0 || remaining > maxWait;

        if (isCalled) {
          if (maxTimeoutId) {
            maxTimeoutId = clearTimeout(maxTimeoutId);
          }
          lastCalled = stamp;
          result = func.apply(thisArg, args);
        }
        else if (!maxTimeoutId) {
          maxTimeoutId = setTimeout(maxDelayed, remaining);
        }
      }
      if (isCalled && timeoutId) {
        timeoutId = clearTimeout(timeoutId);
      }
      else if (!timeoutId && wait !== maxWait) {
        timeoutId = setTimeout(delayed, wait);
      }
      if (leadingCall) {
        isCalled = true;
        result = func.apply(thisArg, args);
      }
      if (isCalled && !timeoutId && !maxTimeoutId) {
        args = thisArg = undefined;
      }
      return result;
    }

    debounced.cancel = cancel;
    return debounced;
  }

  /**
   * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
   * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(1);
   * // => false
   */
  function isObject(value) {
    // Avoid a V8 JIT bug in Chrome 19-20.
    // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
    var type = typeof value;
    return !!value && (type == 'object' || type == 'function');
  }

  return debounce;

})();

module.exports = debounce;
},{}],4:[function(_dereq_,module,exports){
;(function(){ 'use strict';
  
  var bendPointUtilities = _dereq_('./bendPointUtilities');
  var debounce = _dereq_("./debounce");
  
  // registers the extension on a cytoscape lib ref
  var register = function( cytoscape, $ ){
    var uiUtilities = _dereq_('./UIUtilities');
    
    if( !cytoscape ){ return; } // can't register if cytoscape unspecified

    var defaults = {
      // this function specifies the poitions of bend points
      bendPositionsFunction: function(ele) {
        return ele.data('bendPointPositions');
      },
      // whether to initilize bend points on creation of this extension automatically
      initBendPointsAutomatically: true,
      // curve-style of the bent edge; either segments or unbundled-bezier
      curveStyle: "segments",
      // the classes of those edges that should be ignored
      ignoredClasses: [],
      // whether the bend editing operations are undoable (requires cytoscape-undo-redo.js)
      undoable: false,
      // the size of bend shape is obtained by multipling width of edge with this parameter
      bendShapeSizeFactor: 3,
      // whether to start the plugin in the enabled state
      enabled: true,
      // title of add bend point menu item (User may need to adjust width of menu items according to length of this option)
      addBendMenuItemTitle: "Add Bend Point",
      // title of remove bend point menu item (User may need to adjust width of menu items according to length of this option)
      removeBendMenuItemTitle: "Remove Bend Point"
    };
    
    var options;
    var initialized = false;
    
    // Merge default options with the ones coming from parameter
    function extend(defaults, options) {
      var obj = {};

      for (var i in defaults) {
        obj[i] = defaults[i];
      }

      for (var i in options) {
        obj[i] = options[i];
      }

      return obj;
    };
    
    cytoscape( 'core', 'edgeBendEditing', function(opts){
      var cy = this;
      
      if( opts === 'initialized' ) {
        return initialized;
      }
      
      if( opts !== 'get' ) {
        // merge the options with default ones
        options = extend(defaults, opts);
        initialized = true;
        var cyCSSProps = {
          'curve-style': options.curveStyle,
          'edge-distances': 'node-position'
        };
        cyCSSProps[bendPointUtilities.getWeightsName(options.curveStyle)] = function (ele) {
          return bendPointUtilities.getSegmentWeightsString(ele);
        };
        cyCSSProps[bendPointUtilities.getDistancesName(options.curveStyle)] = function (ele) {
          return bendPointUtilities.getSegmentDistancesString(ele);
        };

        // define edgebendediting-hasbendpoints css class
        cy.style().selector('.edgebendediting-hasbendpoints').css(cyCSSProps);

        bendPointUtilities.setIgnoredClasses(options.ignoredClasses);

        // init bend positions conditionally
        if (options.initBendPointsAutomatically) {
          bendPointUtilities.initBendPoints(options.bendPositionsFunction, cy.edges(), options.ignoredClasses);
        }

        if(options.enabled)
          uiUtilities(options, cy);
        else
          uiUtilities("unbind", cy);
      }
      
      var instance = initialized ? {
        /*
        * get segment points of the given edge in an array A,
        * A[2 * i] is the x coordinate and A[2 * i + 1] is the y coordinate
        * of the ith bend point. (Returns undefined if the curve style is not segments)
        */
        getSegmentPoints: function(ele) {
          return bendPointUtilities.getSegmentPoints(ele);
        },
        // Initilize bend points for the given edges using 'options.bendPositionsFunction'
        initBendPoints: function(eles) {
          bendPointUtilities.initBendPoints(options.bendPositionsFunction, eles);
        }
      } : undefined;

      return instance; // chainability
    } );

  };

  if( typeof module !== 'undefined' && module.exports ){ // expose as a commonjs module
    module.exports = register;
  }

  if( typeof define !== 'undefined' && define.amd ){ // expose as an amd/requirejs module
    define('cytoscape-edge-bend-editing', function(){
      return register;
    });
  }

  if( typeof cytoscape !== 'undefined' && $ ){ // expose to global cytoscape (i.e. window.cytoscape)
    register( cytoscape, $ );
  }

})();

},{"./UIUtilities":1,"./bendPointUtilities":2,"./debounce":3}],5:[function(_dereq_,module,exports){
module.exports = function (cy) {
  if (cy.undoRedo == null)
    return;

  var ur = cy.undoRedo({
    defaultActions: false,
    isDebug: true
  });

  function changeBendPoints(param) {
    var edge = param.edge;
    var result = {
      edge: edge,
      weights: param.set ? edge.data('cyedgebendeditingWeights') : param.weights,
      distances: param.set ? edge.data('cyedgebendeditingDistances') : param.distances,
      set: true//As the result will not be used for the first function call params should be used to set the data
    };

    var hasBend = param.weights && param.weights.length > 0;

    //Check if we need to set the weights and distances by the param values
    if (param.set) {
      hasBend ? edge.data('cyedgebendeditingWeights', param.weights) : edge.removeData('cyedgebendeditingWeights');
      hasBend ? edge.data('cyedgebendeditingDistances', param.distances) : edge.removeData('cyedgebendeditingDistances');

      //refresh the curve style as the number of bend point would be changed by the previous operation
      if (hasBend) {
        edge.addClass('edgebendediting-hasbendpoints');
      }
      else {
        edge.removeClass('edgebendediting-hasbendpoints');
      }
    }
    
    edge.trigger('cyedgebendediting.changeBendPoints');

    return result;
  }

  ur.action('changeBendPoints', changeBendPoints, changeBendPoints);
};

},{}]},{},[4])(4)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvVUlVdGlsaXRpZXMuanMiLCJzcmMvYmVuZFBvaW50VXRpbGl0aWVzLmpzIiwic3JjL2RlYm91bmNlLmpzIiwic3JjL2luZGV4LmpzIiwic3JjL3JlZ2lzdGVyVW5kb1JlZG9GdW5jdGlvbnMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNocUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuYUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN09BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBkZWJvdW5jZSA9IHJlcXVpcmUoJy4vZGVib3VuY2UnKTtcclxudmFyIGJlbmRQb2ludFV0aWxpdGllcyA9IHJlcXVpcmUoJy4vYmVuZFBvaW50VXRpbGl0aWVzJyk7XHJcbnZhciByZWdpc3RlclVuZG9SZWRvRnVuY3Rpb25zID0gcmVxdWlyZSgnLi9yZWdpc3RlclVuZG9SZWRvRnVuY3Rpb25zJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwYXJhbXMsIGN5KSB7XHJcbiAgdmFyIGZuID0gcGFyYW1zO1xyXG5cclxuICB2YXIgYWRkQmVuZFBvaW50Q3h0TWVudUlkID0gJ2N5LWVkZ2UtYmVuZC1lZGl0aW5nLWN4dC1hZGQtYmVuZC1wb2ludCc7XHJcbiAgdmFyIHJlbW92ZUJlbmRQb2ludEN4dE1lbnVJZCA9ICdjeS1lZGdlLWJlbmQtZWRpdGluZy1jeHQtcmVtb3ZlLWJlbmQtcG9pbnQnO1xyXG4gIHZhciBlUG9zaXRpb24sIGVTdHlsZSwgZVJlbW92ZSwgZUFkZCwgZVpvb20sIGVTZWxlY3QsIGVVbnNlbGVjdCwgZVRhcFN0YXJ0LCBlVGFwRHJhZywgZVRhcEVuZCwgZUN4dFRhcDtcclxuICAvLyBsYXN0IHN0YXR1cyBvZiBnZXN0dXJlc1xyXG4gIHZhciBsYXN0UGFubmluZ0VuYWJsZWQsIGxhc3Rab29taW5nRW5hYmxlZCwgbGFzdEJveFNlbGVjdGlvbkVuYWJsZWQ7XHJcbiAgLy8gc3RhdHVzIG9mIGVkZ2UgdG8gaGlnaGxpZ2h0IGJlbmRzIGFuZCBzZWxlY3RlZCBlZGdlc1xyXG4gIHZhciBlZGdlVG9IaWdobGlnaHRCZW5kcywgbnVtYmVyT2ZTZWxlY3RlZEVkZ2VzO1xyXG4gIFxyXG4gIHZhciBmdW5jdGlvbnMgPSB7XHJcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIC8vIHJlZ2lzdGVyIHVuZG8gcmVkbyBmdW5jdGlvbnNcclxuICAgICAgcmVnaXN0ZXJVbmRvUmVkb0Z1bmN0aW9ucyhjeSk7XHJcbiAgICAgIFxyXG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICAgIHZhciBvcHRzID0gcGFyYW1zO1xyXG4gICAgICB2YXIgJGNvbnRhaW5lciA9ICQodGhpcyk7XHJcbiAgICAgIHZhciAkY2FudmFzID0gJCgnPGNhbnZhcz48L2NhbnZhcz4nKTtcclxuXHJcbiAgICAgICRjb250YWluZXIuYXBwZW5kKCRjYW52YXMpO1xyXG5cclxuICAgICAgdmFyIGN4dEFkZEJlbmRQb2ludEZjbiA9IGZ1bmN0aW9uIChldmVudCkge1xyXG4gICAgICAgIHZhciBlZGdlID0gZXZlbnQudGFyZ2V0IHx8IGV2ZW50LmN5VGFyZ2V0O1xyXG4gICAgICAgIGlmKCFiZW5kUG9pbnRVdGlsaXRpZXMuaXNJZ25vcmVkRWRnZShlZGdlKSkge1xyXG5cclxuICAgICAgICAgIHZhciBwYXJhbSA9IHtcclxuICAgICAgICAgICAgZWRnZTogZWRnZSxcclxuICAgICAgICAgICAgd2VpZ2h0czogZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ1dlaWdodHMnKSA/IFtdLmNvbmNhdChlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycpKSA6IGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzJyksXHJcbiAgICAgICAgICAgIGRpc3RhbmNlczogZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ0Rpc3RhbmNlcycpID8gW10uY29uY2F0KGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdEaXN0YW5jZXMnKSkgOiBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nRGlzdGFuY2VzJylcclxuICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgYmVuZFBvaW50VXRpbGl0aWVzLmFkZEJlbmRQb2ludCgpO1xyXG5cclxuICAgICAgICAgIGlmIChvcHRpb25zKCkudW5kb2FibGUpIHtcclxuICAgICAgICAgICAgY3kudW5kb1JlZG8oKS5kbygnY2hhbmdlQmVuZFBvaW50cycsIHBhcmFtKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVmcmVzaERyYXdzKCk7XHJcbiAgICAgIH07XHJcblxyXG4gICAgICB2YXIgY3h0UmVtb3ZlQmVuZFBvaW50RmNuID0gZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgdmFyIGVkZ2UgPSBldmVudC50YXJnZXQgfHwgZXZlbnQuY3lUYXJnZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhcmFtID0ge1xyXG4gICAgICAgICAgZWRnZTogZWRnZSxcclxuICAgICAgICAgIHdlaWdodHM6IFtdLmNvbmNhdChlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycpKSxcclxuICAgICAgICAgIGRpc3RhbmNlczogW10uY29uY2F0KGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdEaXN0YW5jZXMnKSlcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBiZW5kUG9pbnRVdGlsaXRpZXMucmVtb3ZlQmVuZFBvaW50KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYob3B0aW9ucygpLnVuZG9hYmxlKSB7XHJcbiAgICAgICAgICBjeS51bmRvUmVkbygpLmRvKCdjaGFuZ2VCZW5kUG9pbnRzJywgcGFyYW0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZWZyZXNoRHJhd3MoKTtcclxuICAgICAgfTtcclxuICAgICAgXHJcbiAgICAgIHZhciBtZW51SXRlbXMgPSBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6IGFkZEJlbmRQb2ludEN4dE1lbnVJZCxcclxuICAgICAgICAgIHRpdGxlOiBvcHRzLmFkZEJlbmRNZW51SXRlbVRpdGxlLFxyXG4gICAgICAgICAgY29udGVudDogJ0FkZCBCZW5kIFBvaW50JyxcclxuICAgICAgICAgIHNlbGVjdG9yOiAnZWRnZScsXHJcbiAgICAgICAgICBvbkNsaWNrRnVuY3Rpb246IGN4dEFkZEJlbmRQb2ludEZjblxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6IHJlbW92ZUJlbmRQb2ludEN4dE1lbnVJZCxcclxuICAgICAgICAgIHRpdGxlOiBvcHRzLnJlbW92ZUJlbmRNZW51SXRlbVRpdGxlLFxyXG4gICAgICAgICAgY29udGVudDogJ1JlbW92ZSBCZW5kIFBvaW50JyxcclxuICAgICAgICAgIHNlbGVjdG9yOiAnZWRnZScsXHJcbiAgICAgICAgICBvbkNsaWNrRnVuY3Rpb246IGN4dFJlbW92ZUJlbmRQb2ludEZjblxyXG4gICAgICAgIH1cclxuICAgICAgXTtcclxuICAgICAgXHJcbiAgICAgIGlmKGN5LmNvbnRleHRNZW51cykge1xyXG4gICAgICAgIHZhciBtZW51cyA9IGN5LmNvbnRleHRNZW51cygnZ2V0Jyk7XHJcbiAgICAgICAgLy8gSWYgY29udGV4dCBtZW51cyBpcyBhY3RpdmUganVzdCBhcHBlbmQgbWVudSBpdGVtcyBlbHNlIGFjdGl2YXRlIHRoZSBleHRlbnNpb25cclxuICAgICAgICAvLyB3aXRoIGluaXRpYWwgbWVudSBpdGVtc1xyXG4gICAgICAgIGlmIChtZW51cy5pc0FjdGl2ZSgpKSB7XHJcbiAgICAgICAgICBtZW51cy5hcHBlbmRNZW51SXRlbXMobWVudUl0ZW1zKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICBjeS5jb250ZXh0TWVudXMoe1xyXG4gICAgICAgICAgICBtZW51SXRlbXM6IG1lbnVJdGVtc1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICB2YXIgX3NpemVDYW52YXMgPSBkZWJvdW5jZShmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgJGNhbnZhc1xyXG4gICAgICAgICAgLmF0dHIoJ2hlaWdodCcsICRjb250YWluZXIuaGVpZ2h0KCkpXHJcbiAgICAgICAgICAuYXR0cignd2lkdGgnLCAkY29udGFpbmVyLndpZHRoKCkpXHJcbiAgICAgICAgICAuY3NzKHtcclxuICAgICAgICAgICAgJ3Bvc2l0aW9uJzogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgJ3RvcCc6IDAsXHJcbiAgICAgICAgICAgICdsZWZ0JzogMCxcclxuICAgICAgICAgICAgJ3otaW5kZXgnOiAnOTk5J1xyXG4gICAgICAgICAgfSlcclxuICAgICAgICA7XHJcblxyXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgdmFyIGNhbnZhc0JiID0gJGNhbnZhcy5vZmZzZXQoKTtcclxuICAgICAgICAgIHZhciBjb250YWluZXJCYiA9ICRjb250YWluZXIub2Zmc2V0KCk7XHJcblxyXG4gICAgICAgICAgJGNhbnZhc1xyXG4gICAgICAgICAgICAuY3NzKHtcclxuICAgICAgICAgICAgICAndG9wJzogLShjYW52YXNCYi50b3AgLSBjb250YWluZXJCYi50b3ApLFxyXG4gICAgICAgICAgICAgICdsZWZ0JzogLShjYW52YXNCYi5sZWZ0IC0gY29udGFpbmVyQmIubGVmdClcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgIDtcclxuXHJcbiAgICAgICAgICAvLyByZWRyYXcgb24gY2FudmFzIHJlc2l6ZVxyXG4gICAgICAgICAgaWYoY3kpe1xyXG4gICAgICAgICAgICByZWZyZXNoRHJhd3MoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LCAwKTtcclxuXHJcbiAgICAgIH0sIDI1MCk7XHJcblxyXG4gICAgICBmdW5jdGlvbiBzaXplQ2FudmFzKCkge1xyXG4gICAgICAgIF9zaXplQ2FudmFzKCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHNpemVDYW52YXMoKTtcclxuXHJcbiAgICAgICQod2luZG93KS5iaW5kKCdyZXNpemUnLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgc2l6ZUNhbnZhcygpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHZhciBjdHggPSAkY2FudmFzWzBdLmdldENvbnRleHQoJzJkJyk7XHJcblxyXG4gICAgICAvLyB3cml0ZSBvcHRpb25zIHRvIGRhdGFcclxuICAgICAgdmFyIGRhdGEgPSAkY29udGFpbmVyLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nJyk7XHJcbiAgICAgIGlmIChkYXRhID09IG51bGwpIHtcclxuICAgICAgICBkYXRhID0ge307XHJcbiAgICAgIH1cclxuICAgICAgZGF0YS5vcHRpb25zID0gb3B0cztcclxuXHJcbiAgICAgIHZhciBvcHRDYWNoZTtcclxuXHJcbiAgICAgIGZ1bmN0aW9uIG9wdGlvbnMoKSB7XHJcbiAgICAgICAgcmV0dXJuIG9wdENhY2hlIHx8IChvcHRDYWNoZSA9ICRjb250YWluZXIuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmcnKS5vcHRpb25zKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gd2Ugd2lsbCBuZWVkIHRvIGNvbnZlcnQgbW9kZWwgcG9zaXRvbnMgdG8gcmVuZGVyZWQgcG9zaXRpb25zXHJcbiAgICAgIGZ1bmN0aW9uIGNvbnZlcnRUb1JlbmRlcmVkUG9zaXRpb24obW9kZWxQb3NpdGlvbikge1xyXG4gICAgICAgIHZhciBwYW4gPSBjeS5wYW4oKTtcclxuICAgICAgICB2YXIgem9vbSA9IGN5Lnpvb20oKTtcclxuXHJcbiAgICAgICAgdmFyIHggPSBtb2RlbFBvc2l0aW9uLnggKiB6b29tICsgcGFuLng7XHJcbiAgICAgICAgdmFyIHkgPSBtb2RlbFBvc2l0aW9uLnkgKiB6b29tICsgcGFuLnk7XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICB4OiB4LFxyXG4gICAgICAgICAgeTogeVxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGZ1bmN0aW9uIHJlZnJlc2hEcmF3cygpIHtcclxuXHJcbiAgICAgICAgdmFyIHcgPSAkY29udGFpbmVyLndpZHRoKCk7XHJcbiAgICAgICAgdmFyIGggPSAkY29udGFpbmVyLmhlaWdodCgpO1xyXG5cclxuICAgICAgICBjdHguY2xlYXJSZWN0KDAsIDAsIHcsIGgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmKCBlZGdlVG9IaWdobGlnaHRCZW5kcyApIHtcclxuICAgICAgICAgIHJlbmRlckJlbmRTaGFwZXMoZWRnZVRvSGlnaGxpZ2h0QmVuZHMpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgXHJcbiAgICAgIC8vIHJlbmRlciB0aGUgYmVuZCBzaGFwZXMgb2YgdGhlIGdpdmVuIGVkZ2VcclxuICAgICAgZnVuY3Rpb24gcmVuZGVyQmVuZFNoYXBlcyhlZGdlKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYoIWVkZ2UuaGFzQ2xhc3MoJ2VkZ2ViZW5kZWRpdGluZy1oYXNiZW5kcG9pbnRzJykpIHtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNlZ3B0cyA9IGJlbmRQb2ludFV0aWxpdGllcy5nZXRTZWdtZW50UG9pbnRzKGVkZ2UpOy8vZWRnZS5fcHJpdmF0ZS5yZGF0YS5zZWdwdHM7XHJcbiAgICAgICAgdmFyIGxlbmd0aCA9IGdldEJlbmRTaGFwZXNMZW5naHQoZWRnZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNyY1BvcyA9IGVkZ2Uuc291cmNlKCkucG9zaXRpb24oKTtcclxuICAgICAgICB2YXIgdGd0UG9zID0gZWRnZS50YXJnZXQoKS5wb3NpdGlvbigpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB3ZWlnaHRzID0gZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ1dlaWdodHMnKTtcclxuICAgICAgICB2YXIgZGlzdGFuY2VzID0gZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ0Rpc3RhbmNlcycpO1xyXG5cclxuICAgICAgICBmb3IodmFyIGkgPSAwOyBzZWdwdHMgJiYgaSA8IHNlZ3B0cy5sZW5ndGg7IGkgPSBpICsgMil7XHJcbiAgICAgICAgICB2YXIgYmVuZFggPSBzZWdwdHNbaV07XHJcbiAgICAgICAgICB2YXIgYmVuZFkgPSBzZWdwdHNbaSArIDFdO1xyXG5cclxuICAgICAgICAgIHZhciBvbGRTdHlsZSA9IGN0eC5maWxsU3R5bGU7XHJcbiAgICAgICAgICBjdHguZmlsbFN0eWxlID0gZWRnZS5jc3MoJ2xpbmUtY29sb3InKTtcclxuICAgICAgICAgIHJlbmRlckJlbmRTaGFwZShiZW5kWCwgYmVuZFksIGxlbmd0aCk7XHJcbiAgICAgICAgICBjdHguZmlsbFN0eWxlID0gb2xkU3R5bGU7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAvLyByZW5kZXIgYSBiZW5kIHNoYXBlIHdpdGggdGhlIGdpdmVuIHBhcmFtZXRlcnNcclxuICAgICAgZnVuY3Rpb24gcmVuZGVyQmVuZFNoYXBlKGJlbmRYLCBiZW5kWSwgbGVuZ3RoKSB7XHJcbiAgICAgICAgLy8gZ2V0IHRoZSB0b3AgbGVmdCBjb29yZGluYXRlc1xyXG4gICAgICAgIHZhciB0b3BMZWZ0WCA9IGJlbmRYIC0gbGVuZ3RoIC8gMjtcclxuICAgICAgICB2YXIgdG9wTGVmdFkgPSBiZW5kWSAtIGxlbmd0aCAvIDI7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gY29udmVydCB0byByZW5kZXJlZCBwYXJhbWV0ZXJzXHJcbiAgICAgICAgdmFyIHJlbmRlcmVkVG9wTGVmdFBvcyA9IGNvbnZlcnRUb1JlbmRlcmVkUG9zaXRpb24oe3g6IHRvcExlZnRYLCB5OiB0b3BMZWZ0WX0pO1xyXG4gICAgICAgIGxlbmd0aCAqPSBjeS56b29tKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gcmVuZGVyIGJlbmQgc2hhcGVcclxuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XHJcbiAgICAgICAgY3R4LnJlY3QocmVuZGVyZWRUb3BMZWZ0UG9zLngsIHJlbmRlcmVkVG9wTGVmdFBvcy55LCBsZW5ndGgsIGxlbmd0aCk7XHJcbiAgICAgICAgY3R4LmZpbGwoKTtcclxuICAgICAgICBjdHguY2xvc2VQYXRoKCk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIGdldCB0aGUgbGVuZ3RoIG9mIGJlbmQgcG9pbnRzIHRvIGJlIHJlbmRlcmVkXHJcbiAgICAgIGZ1bmN0aW9uIGdldEJlbmRTaGFwZXNMZW5naHQoZWRnZSkge1xyXG4gICAgICAgIHZhciBmYWN0b3IgPSBvcHRpb25zKCkuYmVuZFNoYXBlU2l6ZUZhY3RvcjtcclxuICAgICAgICBpZiAocGFyc2VGbG9hdChlZGdlLmNzcygnd2lkdGgnKSkgPD0gMi41KVxyXG4gICAgICAgICAgcmV0dXJuIDIuNSAqIGZhY3RvcjtcclxuICAgICAgICBlbHNlIHJldHVybiBwYXJzZUZsb2F0KGVkZ2UuY3NzKCd3aWR0aCcpKSpmYWN0b3I7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIGNoZWNrIGlmIHRoZSBwb2ludCByZXByZXNlbnRlZCBieSB7eCwgeX0gaXMgaW5zaWRlIHRoZSBiZW5kIHNoYXBlXHJcbiAgICAgIGZ1bmN0aW9uIGNoZWNrSWZJbnNpZGVCZW5kU2hhcGUoeCwgeSwgbGVuZ3RoLCBjZW50ZXJYLCBjZW50ZXJZKXtcclxuICAgICAgICB2YXIgbWluWCA9IGNlbnRlclggLSBsZW5ndGggLyAyO1xyXG4gICAgICAgIHZhciBtYXhYID0gY2VudGVyWCArIGxlbmd0aCAvIDI7XHJcbiAgICAgICAgdmFyIG1pblkgPSBjZW50ZXJZIC0gbGVuZ3RoIC8gMjtcclxuICAgICAgICB2YXIgbWF4WSA9IGNlbnRlclkgKyBsZW5ndGggLyAyO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpbnNpZGUgPSAoeCA+PSBtaW5YICYmIHggPD0gbWF4WCkgJiYgKHkgPj0gbWluWSAmJiB5IDw9IG1heFkpO1xyXG4gICAgICAgIHJldHVybiBpbnNpZGU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIGdldCB0aGUgaW5kZXggb2YgYmVuZCBwb2ludCBjb250YWluaW5nIHRoZSBwb2ludCByZXByZXNlbnRlZCBieSB7eCwgeX1cclxuICAgICAgZnVuY3Rpb24gZ2V0Q29udGFpbmluZ0JlbmRTaGFwZUluZGV4KHgsIHksIGVkZ2UpIHtcclxuICAgICAgICBpZihlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycpID09IG51bGwgfHwgZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ1dlaWdodHMnKS5sZW5ndGggPT0gMCl7XHJcbiAgICAgICAgICByZXR1cm4gLTE7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgc2VncHRzID0gYmVuZFBvaW50VXRpbGl0aWVzLmdldFNlZ21lbnRQb2ludHMoZWRnZSk7Ly9lZGdlLl9wcml2YXRlLnJkYXRhLnNlZ3B0cztcclxuICAgICAgICB2YXIgbGVuZ3RoID0gZ2V0QmVuZFNoYXBlc0xlbmdodChlZGdlKTtcclxuXHJcbiAgICAgICAgZm9yKHZhciBpID0gMDsgc2VncHRzICYmIGkgPCBzZWdwdHMubGVuZ3RoOyBpID0gaSArIDIpe1xyXG4gICAgICAgICAgdmFyIGJlbmRYID0gc2VncHRzW2ldO1xyXG4gICAgICAgICAgdmFyIGJlbmRZID0gc2VncHRzW2kgKyAxXTtcclxuXHJcbiAgICAgICAgICB2YXIgaW5zaWRlID0gY2hlY2tJZkluc2lkZUJlbmRTaGFwZSh4LCB5LCBsZW5ndGgsIGJlbmRYLCBiZW5kWSk7XHJcbiAgICAgICAgICBpZihpbnNpZGUpe1xyXG4gICAgICAgICAgICByZXR1cm4gaSAvIDI7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gLTE7XHJcbiAgICAgIH07XHJcbiAgICAgIFxyXG4gICAgICAvLyBzdG9yZSB0aGUgY3VycmVudCBzdGF0dXMgb2YgZ2VzdHVyZXMgYW5kIHNldCB0aGVtIHRvIGZhbHNlXHJcbiAgICAgIGZ1bmN0aW9uIGRpc2FibGVHZXN0dXJlcygpIHtcclxuICAgICAgICBsYXN0UGFubmluZ0VuYWJsZWQgPSBjeS5wYW5uaW5nRW5hYmxlZCgpO1xyXG4gICAgICAgIGxhc3Rab29taW5nRW5hYmxlZCA9IGN5Lnpvb21pbmdFbmFibGVkKCk7XHJcbiAgICAgICAgbGFzdEJveFNlbGVjdGlvbkVuYWJsZWQgPSBjeS5ib3hTZWxlY3Rpb25FbmFibGVkKCk7XHJcblxyXG4gICAgICAgIGN5Lnpvb21pbmdFbmFibGVkKGZhbHNlKVxyXG4gICAgICAgICAgLnBhbm5pbmdFbmFibGVkKGZhbHNlKVxyXG4gICAgICAgICAgLmJveFNlbGVjdGlvbkVuYWJsZWQoZmFsc2UpO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAvLyByZXNldCB0aGUgZ2VzdHVyZXMgYnkgdGhlaXIgbGF0ZXN0IHN0YXR1c1xyXG4gICAgICBmdW5jdGlvbiByZXNldEdlc3R1cmVzKCkge1xyXG4gICAgICAgIGN5Lnpvb21pbmdFbmFibGVkKGxhc3Rab29taW5nRW5hYmxlZClcclxuICAgICAgICAgIC5wYW5uaW5nRW5hYmxlZChsYXN0UGFubmluZ0VuYWJsZWQpXHJcbiAgICAgICAgICAuYm94U2VsZWN0aW9uRW5hYmxlZChsYXN0Qm94U2VsZWN0aW9uRW5hYmxlZCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIGdldCB0aGUgbW92ZWJlbmQgcGFyYW1zIGZyb20gYW4gZWRnZVxyXG4gICAgICBmdW5jdGlvbiBnZXRNb3ZlQmVuZFBhcmFtcyhlZGdlKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGVkZ2U6IGVkZ2UsXHJcbiAgICAgICAgICB3ZWlnaHRzOiBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycpID8gW10uY29uY2F0KGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzJykpIDogW10sXHJcbiAgICAgICAgICBkaXN0YW5jZXM6IGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdEaXN0YW5jZXMnKSA/IFtdLmNvbmNhdChlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nRGlzdGFuY2VzJykpIDogW11cclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICB7ICBcclxuICAgICAgICBsYXN0UGFubmluZ0VuYWJsZWQgPSBjeS5wYW5uaW5nRW5hYmxlZCgpO1xyXG4gICAgICAgIGxhc3Rab29taW5nRW5hYmxlZCA9IGN5Lnpvb21pbmdFbmFibGVkKCk7XHJcbiAgICAgICAgbGFzdEJveFNlbGVjdGlvbkVuYWJsZWQgPSBjeS5ib3hTZWxlY3Rpb25FbmFibGVkKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gSW5pdGlsaXplIHRoZSBlZGdlVG9IaWdobGlnaHRCZW5kcyBhbmQgbnVtYmVyT2ZTZWxlY3RlZEVkZ2VzXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdmFyIHNlbGVjdGVkRWRnZXMgPSBjeS5lZGdlcygnOnNlbGVjdGVkJyk7XHJcbiAgICAgICAgICB2YXIgbnVtYmVyT2ZTZWxlY3RlZEVkZ2VzID0gc2VsZWN0ZWRFZGdlcy5sZW5ndGg7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmICggbnVtYmVyT2ZTZWxlY3RlZEVkZ2VzID09PSAxICkge1xyXG4gICAgICAgICAgICBlZGdlVG9IaWdobGlnaHRCZW5kcyA9IHNlbGVjdGVkRWRnZXNbMF07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGN5LmJpbmQoJ3pvb20gcGFuJywgZVpvb20gPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICBpZiAoICFlZGdlVG9IaWdobGlnaHRCZW5kcyApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICByZWZyZXNoRHJhd3MoKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY3kub24oJ3Bvc2l0aW9uJywgJ25vZGUnLCBlUG9zaXRpb24gPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICB2YXIgbm9kZSA9IHRoaXM7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGVkZ2UgdG8gaGlnaGxpZ2h0IGJlbmRzIG9yIHRoaXMgbm9kZSBpcyBub3QgYW55IGVuZCBvZiB0aGF0IGVkZ2UgcmV0dXJuIGRpcmVjdGx5XHJcbiAgICAgICAgICBpZiAoICFlZGdlVG9IaWdobGlnaHRCZW5kcyB8fCAhKCBlZGdlVG9IaWdobGlnaHRCZW5kcy5kYXRhKCdzb3VyY2UnKSA9PT0gbm9kZS5pZCgpIFxyXG4gICAgICAgICAgICAgICAgICB8fCBlZGdlVG9IaWdobGlnaHRCZW5kcy5kYXRhKCd0YXJnZXQnKSA9PT0gbm9kZS5pZCgpICkgKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgcmVmcmVzaERyYXdzKCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGN5Lm9uKCdzdHlsZScsICdlZGdlLmVkZ2ViZW5kZWRpdGluZy1oYXNiZW5kcG9pbnRzOnNlbGVjdGVkJywgZVN0eWxlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgcmVmcmVzaERyYXdzKCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGN5Lm9uKCdyZW1vdmUnLCAnZWRnZScsIGVSZW1vdmUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICB2YXIgZWRnZSA9IHRoaXM7XHJcbiAgICAgICAgICBpZiAoZWRnZS5zZWxlY3RlZCgpKSB7XHJcbiAgICAgICAgICAgIG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9IG51bWJlck9mU2VsZWN0ZWRFZGdlcyAtIDE7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjeS5zdGFydEJhdGNoKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoZWRnZVRvSGlnaGxpZ2h0QmVuZHMpIHtcclxuICAgICAgICAgICAgICBlZGdlVG9IaWdobGlnaHRCZW5kcy5yZW1vdmVDbGFzcygnY3ktZWRnZS1iZW5kLWVkaXRpbmctaGlnaGxpZ2h0LWJlbmRzJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChudW1iZXJPZlNlbGVjdGVkRWRnZXMgPT09IDEpIHtcclxuICAgICAgICAgICAgICB2YXIgc2VsZWN0ZWRFZGdlcyA9IGN5LmVkZ2VzKCc6c2VsZWN0ZWQnKTtcclxuICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAvLyBJZiB1c2VyIHJlbW92ZXMgYWxsIHNlbGVjdGVkIGVkZ2VzIGF0IGEgc2luZ2xlIG9wZXJhdGlvbiB0aGVuIG91ciAnbnVtYmVyT2ZTZWxlY3RlZEVkZ2VzJ1xyXG4gICAgICAgICAgICAgIC8vIG1heSBiZSBtaXNsZWFkaW5nLiBUaGVyZWZvcmUgd2UgbmVlZCB0byBjaGVjayBpZiB0aGUgbnVtYmVyIG9mIGVkZ2VzIHRvIGhpZ2hsaWdodCBpcyByZWFseSAxIGhlcmUuXHJcbiAgICAgICAgICAgICAgaWYgKHNlbGVjdGVkRWRnZXMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgICAgICAgICBlZGdlVG9IaWdobGlnaHRCZW5kcyA9IHNlbGVjdGVkRWRnZXNbMF07XHJcbiAgICAgICAgICAgICAgICBlZGdlVG9IaWdobGlnaHRCZW5kcy5hZGRDbGFzcygnY3ktZWRnZS1iZW5kLWVkaXRpbmctaGlnaGxpZ2h0LWJlbmRzJyk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0QmVuZHMgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodEJlbmRzID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjeS5lbmRCYXRjaCgpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmVmcmVzaERyYXdzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgIGN5Lm9uKCdhZGQnLCAnZWRnZScsIGVBZGQgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICB2YXIgZWRnZSA9IHRoaXM7XHJcbiAgICAgICAgICBpZiAoZWRnZS5zZWxlY3RlZCgpKSB7XHJcbiAgICAgICAgICAgIG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9IG51bWJlck9mU2VsZWN0ZWRFZGdlcyArIDE7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjeS5zdGFydEJhdGNoKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoZWRnZVRvSGlnaGxpZ2h0QmVuZHMpIHtcclxuICAgICAgICAgICAgICBlZGdlVG9IaWdobGlnaHRCZW5kcy5yZW1vdmVDbGFzcygnY3ktZWRnZS1iZW5kLWVkaXRpbmctaGlnaGxpZ2h0LWJlbmRzJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChudW1iZXJPZlNlbGVjdGVkRWRnZXMgPT09IDEpIHtcclxuICAgICAgICAgICAgICBlZGdlVG9IaWdobGlnaHRCZW5kcyA9IGVkZ2U7XHJcbiAgICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0QmVuZHMuYWRkQ2xhc3MoJ2N5LWVkZ2UtYmVuZC1lZGl0aW5nLWhpZ2hsaWdodC1iZW5kcycpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodEJlbmRzID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjeS5lbmRCYXRjaCgpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmVmcmVzaERyYXdzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY3kub24oJ3NlbGVjdCcsICdlZGdlJywgZVNlbGVjdCA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHZhciBlZGdlID0gdGhpcztcclxuICAgICAgICAgIG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9IG51bWJlck9mU2VsZWN0ZWRFZGdlcyArIDE7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGN5LnN0YXJ0QmF0Y2goKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICBpZiAoZWRnZVRvSGlnaGxpZ2h0QmVuZHMpIHtcclxuICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0QmVuZHMucmVtb3ZlQ2xhc3MoJ2N5LWVkZ2UtYmVuZC1lZGl0aW5nLWhpZ2hsaWdodC1iZW5kcycpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgIGlmIChudW1iZXJPZlNlbGVjdGVkRWRnZXMgPT09IDEpIHtcclxuICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0QmVuZHMgPSBlZGdlO1xyXG4gICAgICAgICAgICBlZGdlVG9IaWdobGlnaHRCZW5kcy5hZGRDbGFzcygnY3ktZWRnZS1iZW5kLWVkaXRpbmctaGlnaGxpZ2h0LWJlbmRzJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0QmVuZHMgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGN5LmVuZEJhdGNoKCk7XHJcbiAgICAgICAgICByZWZyZXNoRHJhd3MoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBjeS5vbigndW5zZWxlY3QnLCAnZWRnZScsIGVVbnNlbGVjdCA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9IG51bWJlck9mU2VsZWN0ZWRFZGdlcyAtIDE7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgY3kuc3RhcnRCYXRjaCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgIGlmIChlZGdlVG9IaWdobGlnaHRCZW5kcykge1xyXG4gICAgICAgICAgICBlZGdlVG9IaWdobGlnaHRCZW5kcy5yZW1vdmVDbGFzcygnY3ktZWRnZS1iZW5kLWVkaXRpbmctaGlnaGxpZ2h0LWJlbmRzJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9PT0gMSkge1xyXG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRFZGdlcyA9IGN5LmVkZ2VzKCc6c2VsZWN0ZWQnKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIElmIHVzZXIgdW5zZWxlY3RzIGFsbCBlZGdlcyBieSB0YXBwaW5nIHRvIHRoZSBjb3JlIGV0Yy4gdGhlbiBvdXIgJ251bWJlck9mU2VsZWN0ZWRFZGdlcydcclxuICAgICAgICAgICAgLy8gbWF5IGJlIG1pc2xlYWRpbmcuIFRoZXJlZm9yZSB3ZSBuZWVkIHRvIGNoZWNrIGlmIHRoZSBudW1iZXIgb2YgZWRnZXMgdG8gaGlnaGxpZ2h0IGlzIHJlYWx5IDEgaGVyZS5cclxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkRWRnZXMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0QmVuZHMgPSBzZWxlY3RlZEVkZ2VzWzBdO1xyXG4gICAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodEJlbmRzLmFkZENsYXNzKCdjeS1lZGdlLWJlbmQtZWRpdGluZy1oaWdobGlnaHQtYmVuZHMnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICBlZGdlVG9IaWdobGlnaHRCZW5kcyA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodEJlbmRzID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjeS5lbmRCYXRjaCgpO1xyXG4gICAgICAgICAgcmVmcmVzaERyYXdzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1vdmVkQmVuZEluZGV4O1xyXG4gICAgICAgIHZhciBtb3ZlZEJlbmRFZGdlO1xyXG4gICAgICAgIHZhciBtb3ZlQmVuZFBhcmFtO1xyXG4gICAgICAgIHZhciBjcmVhdGVCZW5kT25EcmFnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGN5Lm9uKCd0YXBzdGFydCcsICdlZGdlJywgZVRhcFN0YXJ0ID0gZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICB2YXIgZWRnZSA9IHRoaXM7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmICghZWRnZVRvSGlnaGxpZ2h0QmVuZHMgfHwgZWRnZVRvSGlnaGxpZ2h0QmVuZHMuaWQoKSAhPT0gZWRnZS5pZCgpKSB7XHJcbiAgICAgICAgICAgIGNyZWF0ZUJlbmRPbkRyYWcgPSBmYWxzZTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBtb3ZlZEJlbmRFZGdlID0gZWRnZTtcclxuICAgICAgICAgIG1vdmVCZW5kUGFyYW0gPSBnZXRNb3ZlQmVuZFBhcmFtcyhlZGdlVG9IaWdobGlnaHRCZW5kcyk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIHZhciBjeVBvcyA9IGV2ZW50LnBvc2l0aW9uIHx8IGV2ZW50LmN5UG9zaXRpb247XHJcbiAgICAgICAgICB2YXIgY3lQb3NYID0gY3lQb3MueDtcclxuICAgICAgICAgIHZhciBjeVBvc1kgPSBjeVBvcy55O1xyXG5cclxuICAgICAgICAgIHZhciBpbmRleCA9IGdldENvbnRhaW5pbmdCZW5kU2hhcGVJbmRleChjeVBvc1gsIGN5UG9zWSwgZWRnZSk7XHJcbiAgICAgICAgICBpZiAoaW5kZXggIT0gLTEpIHtcclxuICAgICAgICAgICAgdmFyIGN1cnZlU3R5bGUgPSBlZGdlLmNzcygnY3VydmUtc3R5bGUnKTtcclxuICAgICAgICAgICAgaWYoY3VydmVTdHlsZSAhPT0gJ3VuYnVuZGxlZC1iZXppZXInKSB7XHJcbiAgICAgICAgICAgICAgbW92ZWRCZW5kSW5kZXggPSBpbmRleDtcclxuICAgICAgICAgICAgICBkaXNhYmxlR2VzdHVyZXMoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGNyZWF0ZUJlbmRPbkRyYWcgPSB0cnVlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjeS5vbigndGFwc3RhcnQnLCBlVGFwU3RhcnQgPSBmdW5jdGlvbiAoZXZlbnQpIHtcclxuICAgICAgICAgIGlmKGVkZ2VUb0hpZ2hsaWdodEJlbmRzKSB7XHJcbiAgICAgICAgICAgIHZhciBjdXJ2ZVN0eWxlID0gZWRnZVRvSGlnaGxpZ2h0QmVuZHMuY3NzKCdjdXJ2ZS1zdHlsZScpO1xyXG4gICAgICAgICAgICBpZihjdXJ2ZVN0eWxlID09PSAndW5idW5kbGVkLWJlemllcicpIHtcclxuICAgICAgICAgICAgICB2YXIgY3lQb3MgPSBldmVudC5wb3NpdGlvbiB8fCBldmVudC5jeVBvc2l0aW9uO1xyXG4gICAgICAgICAgICAgIHZhciBpbmRleCA9IGdldENvbnRhaW5pbmdCZW5kU2hhcGVJbmRleChjeVBvcy54LCBjeVBvcy55LCBlZGdlVG9IaWdobGlnaHRCZW5kcyk7XHJcbiAgICAgICAgICAgICAgaWYgKGluZGV4ICE9IC0xKSB7XHJcbiAgICAgICAgICAgICAgICBtb3ZlZEJlbmRFZGdlID0gZWRnZVRvSGlnaGxpZ2h0QmVuZHM7XHJcbiAgICAgICAgICAgICAgICBtb3ZlQmVuZFBhcmFtID0gZ2V0TW92ZUJlbmRQYXJhbXMoZWRnZVRvSGlnaGxpZ2h0QmVuZHMpO1xyXG4gICAgICAgICAgICAgICAgbW92ZWRCZW5kSW5kZXggPSBpbmRleDtcclxuICAgICAgICAgICAgICAgIGRpc2FibGVHZXN0dXJlcygpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjeS5vbigndGFwZHJhZycsIGVUYXBEcmFnID0gZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICB2YXIgZWRnZSA9IG1vdmVkQmVuZEVkZ2U7XHJcbiAgICAgICAgICBpZihtb3ZlZEJlbmRFZGdlICE9PSB1bmRlZmluZWQgJiYgYmVuZFBvaW50VXRpbGl0aWVzLmlzSWdub3JlZEVkZ2UoZWRnZSkgKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYoY3JlYXRlQmVuZE9uRHJhZykge1xyXG4gICAgICAgICAgICB2YXIgY3lQb3MgPSBldmVudC5wb3NpdGlvbiB8fCBldmVudC5jeVBvc2l0aW9uO1xyXG4gICAgICAgICAgICBiZW5kUG9pbnRVdGlsaXRpZXMuYWRkQmVuZFBvaW50KGVkZ2UsIGN5UG9zKTtcclxuICAgICAgICAgICAgbW92ZWRCZW5kSW5kZXggPSBnZXRDb250YWluaW5nQmVuZFNoYXBlSW5kZXgoY3lQb3MueCwgY3lQb3MueSwgZWRnZSk7XHJcbiAgICAgICAgICAgIG1vdmVkQmVuZEVkZ2UgPSBlZGdlO1xyXG4gICAgICAgICAgICBjcmVhdGVCZW5kT25EcmFnID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICBkaXNhYmxlR2VzdHVyZXMoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKG1vdmVkQmVuZEVkZ2UgPT09IHVuZGVmaW5lZCB8fCBtb3ZlZEJlbmRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICB2YXIgd2VpZ2h0cyA9IGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzJyk7XHJcbiAgICAgICAgICB2YXIgZGlzdGFuY2VzID0gZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ0Rpc3RhbmNlcycpO1xyXG5cclxuICAgICAgICAgIHZhciByZWxhdGl2ZUJlbmRQb3NpdGlvbiA9IGJlbmRQb2ludFV0aWxpdGllcy5jb252ZXJ0VG9SZWxhdGl2ZUJlbmRQb3NpdGlvbihlZGdlLCBldmVudC5wb3NpdGlvbiB8fCBldmVudC5jeVBvc2l0aW9uKTtcclxuICAgICAgICAgIHdlaWdodHNbbW92ZWRCZW5kSW5kZXhdID0gcmVsYXRpdmVCZW5kUG9zaXRpb24ud2VpZ2h0O1xyXG4gICAgICAgICAgZGlzdGFuY2VzW21vdmVkQmVuZEluZGV4XSA9IHJlbGF0aXZlQmVuZFBvc2l0aW9uLmRpc3RhbmNlO1xyXG5cclxuICAgICAgICAgIGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzJywgd2VpZ2h0cyk7XHJcbiAgICAgICAgICBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nRGlzdGFuY2VzJywgZGlzdGFuY2VzKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgcmVmcmVzaERyYXdzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY3kub24oJ3RhcGVuZCcsIGVUYXBFbmQgPSBmdW5jdGlvbiAoZXZlbnQpIHtcclxuICAgICAgICAgIHZhciBlZGdlID0gbW92ZWRCZW5kRWRnZTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYoIGVkZ2UgIT09IHVuZGVmaW5lZCApIHtcclxuICAgICAgICAgICAgaWYoIG1vdmVkQmVuZEluZGV4ICE9IHVuZGVmaW5lZCApIHtcclxuICAgICAgICAgICAgICB2YXIgc3RhcnRYID0gZWRnZS5zb3VyY2UoKS5wb3NpdGlvbigneCcpO1xyXG4gICAgICAgICAgICAgIHZhciBzdGFydFkgPSBlZGdlLnNvdXJjZSgpLnBvc2l0aW9uKCd5Jyk7XHJcbiAgICAgICAgICAgICAgdmFyIGVuZFggPSBlZGdlLnRhcmdldCgpLnBvc2l0aW9uKCd4Jyk7XHJcbiAgICAgICAgICAgICAgdmFyIGVuZFkgPSBlZGdlLnRhcmdldCgpLnBvc2l0aW9uKCd5Jyk7XHJcbiAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgdmFyIHNlZ1B0cyA9IGJlbmRQb2ludFV0aWxpdGllcy5nZXRTZWdtZW50UG9pbnRzKGVkZ2UpO1xyXG4gICAgICAgICAgICAgIHZhciBhbGxQdHMgPSBbc3RhcnRYLCBzdGFydFldLmNvbmNhdChzZWdQdHMpLmNvbmNhdChbZW5kWCwgZW5kWV0pO1xyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIHZhciBwb2ludEluZGV4ID0gbW92ZWRCZW5kSW5kZXggKyAxO1xyXG4gICAgICAgICAgICAgIHZhciBwcmVJbmRleCA9IHBvaW50SW5kZXggLSAxO1xyXG4gICAgICAgICAgICAgIHZhciBwb3NJbmRleCA9IHBvaW50SW5kZXggKyAxO1xyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIHZhciBwb2ludCA9IHtcclxuICAgICAgICAgICAgICAgIHg6IGFsbFB0c1syICogcG9pbnRJbmRleF0sXHJcbiAgICAgICAgICAgICAgICB5OiBhbGxQdHNbMiAqIHBvaW50SW5kZXggKyAxXVxyXG4gICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgdmFyIHByZVBvaW50ID0ge1xyXG4gICAgICAgICAgICAgICAgeDogYWxsUHRzWzIgKiBwcmVJbmRleF0sXHJcbiAgICAgICAgICAgICAgICB5OiBhbGxQdHNbMiAqIHByZUluZGV4ICsgMV1cclxuICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIHZhciBwb3NQb2ludCA9IHtcclxuICAgICAgICAgICAgICAgIHg6IGFsbFB0c1syICogcG9zSW5kZXhdLFxyXG4gICAgICAgICAgICAgICAgeTogYWxsUHRzWzIgKiBwb3NJbmRleCArIDFdXHJcbiAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICB2YXIgbmVhclRvTGluZTtcclxuICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICBpZiggKCBwb2ludC54ID09PSBwcmVQb2ludC54ICYmIHBvaW50LnkgPT09IHByZVBvaW50LnkgKSB8fCAoIHBvaW50LnggPT09IHByZVBvaW50LnggJiYgcG9pbnQueSA9PT0gcHJlUG9pbnQueSApICkge1xyXG4gICAgICAgICAgICAgICAgbmVhclRvTGluZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdmFyIG0xID0gKCBwcmVQb2ludC55IC0gcG9zUG9pbnQueSApIC8gKCBwcmVQb2ludC54IC0gcG9zUG9pbnQueCApO1xyXG4gICAgICAgICAgICAgICAgdmFyIG0yID0gLTEgLyBtMTtcclxuXHJcbiAgICAgICAgICAgICAgICB2YXIgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMgPSB7XHJcbiAgICAgICAgICAgICAgICAgIHNyY1BvaW50OiBwcmVQb2ludCxcclxuICAgICAgICAgICAgICAgICAgdGd0UG9pbnQ6IHBvc1BvaW50LFxyXG4gICAgICAgICAgICAgICAgICBtMTogbTEsXHJcbiAgICAgICAgICAgICAgICAgIG0yOiBtMlxyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAvL2dldCB0aGUgaW50ZXJzZWN0aW9uIG9mIHRoZSBjdXJyZW50IHNlZ21lbnQgd2l0aCB0aGUgbmV3IGJlbmQgcG9pbnRcclxuICAgICAgICAgICAgICAgIHZhciBjdXJyZW50SW50ZXJzZWN0aW9uID0gYmVuZFBvaW50VXRpbGl0aWVzLmdldEludGVyc2VjdGlvbihlZGdlLCBwb2ludCwgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMpO1xyXG4gICAgICAgICAgICAgICAgdmFyIGRpc3QgPSBNYXRoLnNxcnQoIE1hdGgucG93KCAocG9pbnQueCAtIGN1cnJlbnRJbnRlcnNlY3Rpb24ueCksIDIgKSBcclxuICAgICAgICAgICAgICAgICAgICAgICAgKyBNYXRoLnBvdyggKHBvaW50LnkgLSBjdXJyZW50SW50ZXJzZWN0aW9uLnkpLCAyICkpO1xyXG4gICAgICAgICAgICAgICAgXHJcbi8vICAgICAgICAgICAgICAgIHZhciBsZW5ndGggPSBNYXRoLnNxcnQoIE1hdGgucG93KCAocG9zUG9pbnQueCAtIHByZVBvaW50LngpLCAyICkgXHJcbi8vICAgICAgICAgICAgICAgICAgICAgICAgKyBNYXRoLnBvdyggKHBvc1BvaW50LnkgLSBwcmVQb2ludC55KSwgMiApKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYoIGRpc3QgIDwgOCApIHtcclxuICAgICAgICAgICAgICAgICAgbmVhclRvTGluZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgaWYoIG5lYXJUb0xpbmUgKVxyXG4gICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGJlbmRQb2ludFV0aWxpdGllcy5yZW1vdmVCZW5kUG9pbnQoZWRnZSwgbW92ZWRCZW5kSW5kZXgpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBpZiAoZWRnZSAhPT0gdW5kZWZpbmVkICYmIG1vdmVCZW5kUGFyYW0gIT09IHVuZGVmaW5lZCAmJiBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycpXHJcbiAgICAgICAgICAgICAgICAgICYmIGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzJykudG9TdHJpbmcoKSAhPSBtb3ZlQmVuZFBhcmFtLndlaWdodHMudG9TdHJpbmcoKSkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYob3B0aW9ucygpLnVuZG9hYmxlKSB7XHJcbiAgICAgICAgICAgICAgY3kudW5kb1JlZG8oKS5kbygnY2hhbmdlQmVuZFBvaW50cycsIG1vdmVCZW5kUGFyYW0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgbW92ZWRCZW5kSW5kZXggPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICBtb3ZlZEJlbmRFZGdlID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgbW92ZUJlbmRQYXJhbSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgIGNyZWF0ZUJlbmRPbkRyYWcgPSB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgICAgcmVzZXRHZXN0dXJlcygpO1xyXG4gICAgICAgICAgcmVmcmVzaERyYXdzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY3kub24oJ2N4dHRhcCcsICdlZGdlJywgZUN4dFRhcCA9IGZ1bmN0aW9uIChldmVudCkge1xyXG4gICAgICAgICAgdmFyIGVkZ2UgPSB0aGlzO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICB2YXIgbWVudXMgPSBjeS5jb250ZXh0TWVudXMoJ2dldCcpOyAvLyBnZXQgY29udGV4dCBtZW51cyBpbnN0YW5jZVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBpZighZWRnZVRvSGlnaGxpZ2h0QmVuZHMgfHwgZWRnZVRvSGlnaGxpZ2h0QmVuZHMuaWQoKSAhPSBlZGdlLmlkKCkgfHwgYmVuZFBvaW50VXRpbGl0aWVzLmlzSWdub3JlZEVkZ2UoZWRnZSkpIHtcclxuICAgICAgICAgICAgbWVudXMuaGlkZU1lbnVJdGVtKHJlbW92ZUJlbmRQb2ludEN4dE1lbnVJZCk7XHJcbiAgICAgICAgICAgIG1lbnVzLmhpZGVNZW51SXRlbShhZGRCZW5kUG9pbnRDeHRNZW51SWQpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgdmFyIGN5UG9zID0gZXZlbnQucG9zaXRpb24gfHwgZXZlbnQuY3lQb3NpdGlvbjtcclxuICAgICAgICAgIHZhciBzZWxlY3RlZEJlbmRJbmRleCA9IGdldENvbnRhaW5pbmdCZW5kU2hhcGVJbmRleChjeVBvcy54LCBjeVBvcy55LCBlZGdlKTtcclxuICAgICAgICAgIGlmIChzZWxlY3RlZEJlbmRJbmRleCA9PSAtMSkge1xyXG4gICAgICAgICAgICBtZW51cy5oaWRlTWVudUl0ZW0ocmVtb3ZlQmVuZFBvaW50Q3h0TWVudUlkKTtcclxuICAgICAgICAgICAgbWVudXMuc2hvd01lbnVJdGVtKGFkZEJlbmRQb2ludEN4dE1lbnVJZCk7XHJcbiAgICAgICAgICAgIGJlbmRQb2ludFV0aWxpdGllcy5jdXJyZW50Q3R4UG9zID0gY3lQb3M7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgbWVudXMuaGlkZU1lbnVJdGVtKGFkZEJlbmRQb2ludEN4dE1lbnVJZCk7XHJcbiAgICAgICAgICAgIG1lbnVzLnNob3dNZW51SXRlbShyZW1vdmVCZW5kUG9pbnRDeHRNZW51SWQpO1xyXG4gICAgICAgICAgICBiZW5kUG9pbnRVdGlsaXRpZXMuY3VycmVudEJlbmRJbmRleCA9IHNlbGVjdGVkQmVuZEluZGV4O1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGJlbmRQb2ludFV0aWxpdGllcy5jdXJyZW50Q3R4RWRnZSA9IGVkZ2U7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY3kub24oJ2N5ZWRnZWJlbmRlZGl0aW5nLmNoYW5nZUJlbmRQb2ludHMnLCAnZWRnZScsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgdmFyIGVkZ2UgPSB0aGlzO1xyXG4gICAgICAgICAgY3kuc3RhcnRCYXRjaCgpO1xyXG4gICAgICAgICAgY3kuZWRnZXMoKS51bnNlbGVjdCgpO1xyXG4gICAgICAgICAgZWRnZS5zZWxlY3QoKTtcclxuICAgICAgICAgIGN5LmVuZEJhdGNoKCk7XHJcbiAgICAgICAgICByZWZyZXNoRHJhd3MoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG5cclxuICAgICAgJGNvbnRhaW5lci5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZycsIGRhdGEpO1xyXG4gICAgfSxcclxuICAgIHVuYmluZDogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGN5Lm9mZigncG9zaXRpb24nLCAnbm9kZScsIGVQb3NpdGlvbilcclxuICAgICAgICAgIC5vZmYoJ3JlbW92ZScsICdub2RlJywgZVJlbW92ZSlcclxuICAgICAgICAgIC5vZmYoJ2FkZCcsICdub2RlJywgZUFkZClcclxuICAgICAgICAgIC5vZmYoJ3N0eWxlJywgJ2VkZ2UuZWRnZWJlbmRlZGl0aW5nLWhhc2JlbmRwb2ludHM6c2VsZWN0ZWQnLCBlU3R5bGUpXHJcbiAgICAgICAgICAub2ZmKCdzZWxlY3QnLCAnZWRnZScsIGVTZWxlY3QpXHJcbiAgICAgICAgICAub2ZmKCd1bnNlbGVjdCcsICdlZGdlJywgZVVuc2VsZWN0KVxyXG4gICAgICAgICAgLm9mZigndGFwc3RhcnQnLCAnZWRnZScsIGVUYXBTdGFydClcclxuICAgICAgICAgIC5vZmYoJ3RhcGRyYWcnLCBlVGFwRHJhZylcclxuICAgICAgICAgIC5vZmYoJ3RhcGVuZCcsIGVUYXBFbmQpXHJcbiAgICAgICAgICAub2ZmKCdjeHR0YXAnLCBlQ3h0VGFwKTtcclxuXHJcbiAgICAgICAgY3kudW5iaW5kKFwiem9vbSBwYW5cIiwgZVpvb20pO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIGlmIChmdW5jdGlvbnNbZm5dKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb25zW2ZuXS5hcHBseSgkKGN5LmNvbnRhaW5lcigpKSwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZm4gPT0gJ29iamVjdCcgfHwgIWZuKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb25zLmluaXQuYXBwbHkoJChjeS5jb250YWluZXIoKSksIGFyZ3VtZW50cyk7XHJcbiAgfSBlbHNlIHtcclxuICAgICQuZXJyb3IoJ05vIHN1Y2ggZnVuY3Rpb24gYCcgKyBmbiArICdgIGZvciBjeXRvc2NhcGUuanMtZWRnZS1iZW5kLWVkaXRpbmcnKTtcclxuICB9XHJcblxyXG4gIHJldHVybiAkKHRoaXMpO1xyXG59O1xyXG4iLCJ2YXIgYmVuZFBvaW50VXRpbGl0aWVzID0ge1xyXG4gIGN1cnJlbnRDdHhFZGdlOiB1bmRlZmluZWQsXHJcbiAgY3VycmVudEN0eFBvczogdW5kZWZpbmVkLFxyXG4gIGN1cnJlbnRCZW5kSW5kZXg6IHVuZGVmaW5lZCxcclxuICBpZ25vcmVkQ2xhc3NlczogdW5kZWZpbmVkLFxyXG4gIHNldElnbm9yZWRDbGFzc2VzOiBmdW5jdGlvbihfaWdub3JlZENsYXNzZXMpIHtcclxuICAgIHRoaXMuaWdub3JlZENsYXNzZXMgPSBfaWdub3JlZENsYXNzZXM7XHJcbiAgfSxcclxuICAvLyBpbml0aWxpemUgYmVuZCBwb2ludHMgYmFzZWQgb24gYmVuZFBvc2l0aW9uc0ZjblxyXG4gIGluaXRCZW5kUG9pbnRzOiBmdW5jdGlvbihiZW5kUG9zaXRpb25zRmNuLCBlZGdlcykge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlZGdlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICB2YXIgZWRnZSA9IGVkZ2VzW2ldO1xyXG4gICAgICBpZighdGhpcy5pc0lnbm9yZWRFZGdlKGVkZ2UpKSB7XHJcblxyXG4gICAgICAgIC8vIGdldCB0aGUgYmVuZCBwb3NpdGlvbnMgYnkgYXBwbHlpbmcgdGhlIGZ1bmN0aW9uIGZvciB0aGlzIGVkZ2VcclxuICAgICAgICB2YXIgYmVuZFBvc2l0aW9ucyA9IGJlbmRQb3NpdGlvbnNGY24uYXBwbHkodGhpcywgZWRnZSk7XHJcbiAgICAgICAgLy8gY2FsY3VsYXRlIHJlbGF0aXZlIGJlbmQgcG9zaXRpb25zXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHRoaXMuY29udmVydFRvUmVsYXRpdmVCZW5kUG9zaXRpb25zKGVkZ2UsIGJlbmRQb3NpdGlvbnMpO1xyXG5cclxuICAgICAgICAvLyBpZiB0aGVyZSBhcmUgYmVuZCBwb2ludHMgc2V0IHdlaWdodHMgYW5kIGRpc3RhbmNlcyBhY2NvcmRpbmdseSBhbmQgYWRkIGNsYXNzIHRvIGVuYWJsZSBzdHlsZSBjaGFuZ2VzXHJcbiAgICAgICAgaWYgKHJlc3VsdC5kaXN0YW5jZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ1dlaWdodHMnLCByZXN1bHQud2VpZ2h0cyk7XHJcbiAgICAgICAgICBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nRGlzdGFuY2VzJywgcmVzdWx0LmRpc3RhbmNlcyk7XHJcbiAgICAgICAgICBlZGdlLmFkZENsYXNzKCdlZGdlYmVuZGVkaXRpbmctaGFzYmVuZHBvaW50cycpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0sXHJcblxyXG4gIGlzSWdub3JlZEVkZ2U6IGZ1bmN0aW9uKGVkZ2UpIHtcclxuICAgIGZvcih2YXIgaSA9IDA7IHRoaXMuaWdub3JlZENsYXNzZXMgJiYgaSA8ICB0aGlzLmlnbm9yZWRDbGFzc2VzLmxlbmd0aDsgaSsrKXtcclxuICAgICAgaWYoZWRnZS5oYXNDbGFzcyh0aGlzLmlnbm9yZWRDbGFzc2VzW2ldKSlcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9LFxyXG4gIC8vR2V0IHRoZSBkaXJlY3Rpb24gb2YgdGhlIGxpbmUgZnJvbSBzb3VyY2UgcG9pbnQgdG8gdGhlIHRhcmdldCBwb2ludFxyXG4gIGdldExpbmVEaXJlY3Rpb246IGZ1bmN0aW9uKHNyY1BvaW50LCB0Z3RQb2ludCl7XHJcbiAgICBpZihzcmNQb2ludC55ID09IHRndFBvaW50LnkgJiYgc3JjUG9pbnQueCA8IHRndFBvaW50Lngpe1xyXG4gICAgICByZXR1cm4gMTtcclxuICAgIH1cclxuICAgIGlmKHNyY1BvaW50LnkgPCB0Z3RQb2ludC55ICYmIHNyY1BvaW50LnggPCB0Z3RQb2ludC54KXtcclxuICAgICAgcmV0dXJuIDI7XHJcbiAgICB9XHJcbiAgICBpZihzcmNQb2ludC55IDwgdGd0UG9pbnQueSAmJiBzcmNQb2ludC54ID09IHRndFBvaW50Lngpe1xyXG4gICAgICByZXR1cm4gMztcclxuICAgIH1cclxuICAgIGlmKHNyY1BvaW50LnkgPCB0Z3RQb2ludC55ICYmIHNyY1BvaW50LnggPiB0Z3RQb2ludC54KXtcclxuICAgICAgcmV0dXJuIDQ7XHJcbiAgICB9XHJcbiAgICBpZihzcmNQb2ludC55ID09IHRndFBvaW50LnkgJiYgc3JjUG9pbnQueCA+IHRndFBvaW50Lngpe1xyXG4gICAgICByZXR1cm4gNTtcclxuICAgIH1cclxuICAgIGlmKHNyY1BvaW50LnkgPiB0Z3RQb2ludC55ICYmIHNyY1BvaW50LnggPiB0Z3RQb2ludC54KXtcclxuICAgICAgcmV0dXJuIDY7XHJcbiAgICB9XHJcbiAgICBpZihzcmNQb2ludC55ID4gdGd0UG9pbnQueSAmJiBzcmNQb2ludC54ID09IHRndFBvaW50Lngpe1xyXG4gICAgICByZXR1cm4gNztcclxuICAgIH1cclxuICAgIHJldHVybiA4Oy8vaWYgc3JjUG9pbnQueSA+IHRndFBvaW50LnkgYW5kIHNyY1BvaW50LnggPCB0Z3RQb2ludC54XHJcbiAgfSxcclxuICBnZXRTcmNUZ3RQb2ludHNBbmRUYW5nZW50czogZnVuY3Rpb24gKGVkZ2UpIHtcclxuICAgIHZhciBzb3VyY2VOb2RlID0gZWRnZS5zb3VyY2UoKTtcclxuICAgIHZhciB0YXJnZXROb2RlID0gZWRnZS50YXJnZXQoKTtcclxuICAgIFxyXG4gICAgdmFyIHRndFBvc2l0aW9uID0gdGFyZ2V0Tm9kZS5wb3NpdGlvbigpO1xyXG4gICAgdmFyIHNyY1Bvc2l0aW9uID0gc291cmNlTm9kZS5wb3NpdGlvbigpO1xyXG4gICAgXHJcbiAgICB2YXIgc3JjUG9pbnQgPSBzb3VyY2VOb2RlLnBvc2l0aW9uKCk7XHJcbiAgICB2YXIgdGd0UG9pbnQgPSB0YXJnZXROb2RlLnBvc2l0aW9uKCk7XHJcblxyXG5cclxuICAgIHZhciBtMSA9ICh0Z3RQb2ludC55IC0gc3JjUG9pbnQueSkgLyAodGd0UG9pbnQueCAtIHNyY1BvaW50LngpO1xyXG4gICAgdmFyIG0yID0gLTEgLyBtMTtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBtMTogbTEsXHJcbiAgICAgIG0yOiBtMixcclxuICAgICAgc3JjUG9pbnQ6IHNyY1BvaW50LFxyXG4gICAgICB0Z3RQb2ludDogdGd0UG9pbnRcclxuICAgIH07XHJcbiAgfSxcclxuICBnZXRJbnRlcnNlY3Rpb246IGZ1bmN0aW9uKGVkZ2UsIHBvaW50LCBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cyl7XHJcbiAgICBpZiAoc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cyA9IHRoaXMuZ2V0U3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMoZWRnZSk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHNyY1BvaW50ID0gc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMuc3JjUG9pbnQ7XHJcbiAgICB2YXIgdGd0UG9pbnQgPSBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cy50Z3RQb2ludDtcclxuICAgIHZhciBtMSA9IHNyY1RndFBvaW50c0FuZFRhbmdlbnRzLm0xO1xyXG4gICAgdmFyIG0yID0gc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMubTI7XHJcblxyXG4gICAgdmFyIGludGVyc2VjdFg7XHJcbiAgICB2YXIgaW50ZXJzZWN0WTtcclxuXHJcbiAgICBpZihtMSA9PSBJbmZpbml0eSB8fCBtMSA9PSAtSW5maW5pdHkpe1xyXG4gICAgICBpbnRlcnNlY3RYID0gc3JjUG9pbnQueDtcclxuICAgICAgaW50ZXJzZWN0WSA9IHBvaW50Lnk7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmKG0xID09IDApe1xyXG4gICAgICBpbnRlcnNlY3RYID0gcG9pbnQueDtcclxuICAgICAgaW50ZXJzZWN0WSA9IHNyY1BvaW50Lnk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgdmFyIGExID0gc3JjUG9pbnQueSAtIG0xICogc3JjUG9pbnQueDtcclxuICAgICAgdmFyIGEyID0gcG9pbnQueSAtIG0yICogcG9pbnQueDtcclxuXHJcbiAgICAgIGludGVyc2VjdFggPSAoYTIgLSBhMSkgLyAobTEgLSBtMik7XHJcbiAgICAgIGludGVyc2VjdFkgPSBtMSAqIGludGVyc2VjdFggKyBhMTtcclxuICAgIH1cclxuXHJcbiAgICAvL0ludGVyc2VjdGlvbiBwb2ludCBpcyB0aGUgaW50ZXJzZWN0aW9uIG9mIHRoZSBsaW5lcyBwYXNzaW5nIHRocm91Z2ggdGhlIG5vZGVzIGFuZFxyXG4gICAgLy9wYXNzaW5nIHRocm91Z2ggdGhlIGJlbmQgcG9pbnQgYW5kIHBlcnBlbmRpY3VsYXIgdG8gdGhlIG90aGVyIGxpbmVcclxuICAgIHZhciBpbnRlcnNlY3Rpb25Qb2ludCA9IHtcclxuICAgICAgeDogaW50ZXJzZWN0WCxcclxuICAgICAgeTogaW50ZXJzZWN0WVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgcmV0dXJuIGludGVyc2VjdGlvblBvaW50O1xyXG4gIH0sXHJcbiAgZ2V0U2VnbWVudFBvaW50czogZnVuY3Rpb24oZWRnZSkge1xyXG4gICAgdmFyIGN1cnZlU3R5bGUgPSBlZGdlLmNzcygnY3VydmUtc3R5bGUnKTtcclxuICAgIGlmKCBjdXJ2ZVN0eWxlICE9PSAnc2VnbWVudHMnICYmIGN1cnZlU3R5bGUgIT09ICd1bmJ1bmRsZWQtYmV6aWVyJyApIHtcclxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIHNlZ3B0cyA9IFtdO1xyXG5cclxuICAgIHZhciBzZWdtZW50V3MgPSBlZGdlLnBzdHlsZSggdGhpcy5nZXRXZWlnaHRzTmFtZShjdXJ2ZVN0eWxlKSApLnBmVmFsdWU7XHJcbiAgICB2YXIgc2VnbWVudERzID0gZWRnZS5wc3R5bGUoIHRoaXMuZ2V0RGlzdGFuY2VzTmFtZShjdXJ2ZVN0eWxlKSApLnBmVmFsdWU7XHJcbiAgICB2YXIgc2VnbWVudHNOID0gTWF0aC5taW4oIHNlZ21lbnRXcy5sZW5ndGgsIHNlZ21lbnREcy5sZW5ndGggKTtcclxuICAgIFxyXG4gICAgdmFyIHNyY1BvcyA9IGVkZ2Uuc291cmNlKCkucG9zaXRpb24oKTtcclxuICAgIHZhciB0Z3RQb3MgPSBlZGdlLnRhcmdldCgpLnBvc2l0aW9uKCk7XHJcblxyXG4gICAgdmFyIGR5ID0gKCB0Z3RQb3MueSAtIHNyY1Bvcy55ICk7XHJcbiAgICB2YXIgZHggPSAoIHRndFBvcy54IC0gc3JjUG9zLnggKTtcclxuICAgIFxyXG4gICAgdmFyIGwgPSBNYXRoLnNxcnQoIGR4ICogZHggKyBkeSAqIGR5ICk7XHJcblxyXG4gICAgdmFyIHZlY3RvciA9IHtcclxuICAgICAgeDogZHgsXHJcbiAgICAgIHk6IGR5XHJcbiAgICB9O1xyXG5cclxuICAgIHZhciB2ZWN0b3JOb3JtID0ge1xyXG4gICAgICB4OiB2ZWN0b3IueCAvIGwsXHJcbiAgICAgIHk6IHZlY3Rvci55IC8gbFxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdmFyIHZlY3Rvck5vcm1JbnZlcnNlID0ge1xyXG4gICAgICB4OiAtdmVjdG9yTm9ybS55LFxyXG4gICAgICB5OiB2ZWN0b3JOb3JtLnhcclxuICAgIH07XHJcblxyXG4gICAgZm9yKCB2YXIgcyA9IDA7IHMgPCBzZWdtZW50c047IHMrKyApe1xyXG4gICAgICB2YXIgdyA9IHNlZ21lbnRXc1sgcyBdO1xyXG4gICAgICB2YXIgZCA9IHNlZ21lbnREc1sgcyBdO1xyXG5cclxuICAgICAgLy8gZCA9IHN3YXBwZWREaXJlY3Rpb24gPyAtZCA6IGQ7XHJcbiAgICAgIC8vXHJcbiAgICAgIC8vIGQgPSBNYXRoLmFicyhkKTtcclxuXHJcbiAgICAgIC8vIHZhciB3MSA9ICFzd2FwcGVkRGlyZWN0aW9uID8gKDEgLSB3KSA6IHc7XHJcbiAgICAgIC8vIHZhciB3MiA9ICFzd2FwcGVkRGlyZWN0aW9uID8gdyA6ICgxIC0gdyk7XHJcblxyXG4gICAgICB2YXIgdzEgPSAoMSAtIHcpO1xyXG4gICAgICB2YXIgdzIgPSB3O1xyXG5cclxuICAgICAgdmFyIHBvc1B0cyA9IHtcclxuICAgICAgICB4MTogc3JjUG9zLngsXHJcbiAgICAgICAgeDI6IHRndFBvcy54LFxyXG4gICAgICAgIHkxOiBzcmNQb3MueSxcclxuICAgICAgICB5MjogdGd0UG9zLnlcclxuICAgICAgfTtcclxuXHJcbiAgICAgIHZhciBtaWRwdFB0cyA9IHBvc1B0cztcclxuICAgICAgXHJcbiAgICAgIFxyXG5cclxuICAgICAgdmFyIGFkanVzdGVkTWlkcHQgPSB7XHJcbiAgICAgICAgeDogbWlkcHRQdHMueDEgKiB3MSArIG1pZHB0UHRzLngyICogdzIsXHJcbiAgICAgICAgeTogbWlkcHRQdHMueTEgKiB3MSArIG1pZHB0UHRzLnkyICogdzJcclxuICAgICAgfTtcclxuXHJcbiAgICAgIHNlZ3B0cy5wdXNoKFxyXG4gICAgICAgIGFkanVzdGVkTWlkcHQueCArIHZlY3Rvck5vcm1JbnZlcnNlLnggKiBkLFxyXG4gICAgICAgIGFkanVzdGVkTWlkcHQueSArIHZlY3Rvck5vcm1JbnZlcnNlLnkgKiBkXHJcbiAgICAgICk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBzZWdwdHM7XHJcbiAgfSxcclxuICBjb252ZXJ0VG9SZWxhdGl2ZUJlbmRQb3NpdGlvbjogZnVuY3Rpb24gKGVkZ2UsIGJlbmRQb2ludCwgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMpIHtcclxuICAgIGlmIChzcmNUZ3RQb2ludHNBbmRUYW5nZW50cyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHNyY1RndFBvaW50c0FuZFRhbmdlbnRzID0gdGhpcy5nZXRTcmNUZ3RQb2ludHNBbmRUYW5nZW50cyhlZGdlKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIGludGVyc2VjdGlvblBvaW50ID0gdGhpcy5nZXRJbnRlcnNlY3Rpb24oZWRnZSwgYmVuZFBvaW50LCBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cyk7XHJcbiAgICB2YXIgaW50ZXJzZWN0WCA9IGludGVyc2VjdGlvblBvaW50Lng7XHJcbiAgICB2YXIgaW50ZXJzZWN0WSA9IGludGVyc2VjdGlvblBvaW50Lnk7XHJcbiAgICBcclxuICAgIHZhciBzcmNQb2ludCA9IHNyY1RndFBvaW50c0FuZFRhbmdlbnRzLnNyY1BvaW50O1xyXG4gICAgdmFyIHRndFBvaW50ID0gc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMudGd0UG9pbnQ7XHJcbiAgICBcclxuICAgIHZhciB3ZWlnaHQ7XHJcbiAgICBcclxuICAgIGlmKCBpbnRlcnNlY3RYICE9IHNyY1BvaW50LnggKSB7XHJcbiAgICAgIHdlaWdodCA9IChpbnRlcnNlY3RYIC0gc3JjUG9pbnQueCkgLyAodGd0UG9pbnQueCAtIHNyY1BvaW50LngpO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiggaW50ZXJzZWN0WSAhPSBzcmNQb2ludC55ICkge1xyXG4gICAgICB3ZWlnaHQgPSAoaW50ZXJzZWN0WSAtIHNyY1BvaW50LnkpIC8gKHRndFBvaW50LnkgLSBzcmNQb2ludC55KTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICB3ZWlnaHQgPSAwO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgZGlzdGFuY2UgPSBNYXRoLnNxcnQoTWF0aC5wb3coKGludGVyc2VjdFkgLSBiZW5kUG9pbnQueSksIDIpXHJcbiAgICAgICAgKyBNYXRoLnBvdygoaW50ZXJzZWN0WCAtIGJlbmRQb2ludC54KSwgMikpO1xyXG4gICAgXHJcbiAgICAvL0dldCB0aGUgZGlyZWN0aW9uIG9mIHRoZSBsaW5lIGZvcm0gc291cmNlIHBvaW50IHRvIHRhcmdldCBwb2ludFxyXG4gICAgdmFyIGRpcmVjdGlvbjEgPSB0aGlzLmdldExpbmVEaXJlY3Rpb24oc3JjUG9pbnQsIHRndFBvaW50KTtcclxuICAgIC8vR2V0IHRoZSBkaXJlY3Rpb24gb2YgdGhlIGxpbmUgZnJvbSBpbnRlc2VjdGlvbiBwb2ludCB0byBiZW5kIHBvaW50XHJcbiAgICB2YXIgZGlyZWN0aW9uMiA9IHRoaXMuZ2V0TGluZURpcmVjdGlvbihpbnRlcnNlY3Rpb25Qb2ludCwgYmVuZFBvaW50KTtcclxuICAgIFxyXG4gICAgLy9JZiB0aGUgZGlmZmVyZW5jZSBpcyBub3QgLTIgYW5kIG5vdCA2IHRoZW4gdGhlIGRpcmVjdGlvbiBvZiB0aGUgZGlzdGFuY2UgaXMgbmVnYXRpdmVcclxuICAgIGlmKGRpcmVjdGlvbjEgLSBkaXJlY3Rpb24yICE9IC0yICYmIGRpcmVjdGlvbjEgLSBkaXJlY3Rpb24yICE9IDYpe1xyXG4gICAgICBpZihkaXN0YW5jZSAhPSAwKVxyXG4gICAgICAgIGRpc3RhbmNlID0gLTEgKiBkaXN0YW5jZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgd2VpZ2h0OiB3ZWlnaHQsXHJcbiAgICAgIGRpc3RhbmNlOiBkaXN0YW5jZVxyXG4gICAgfTtcclxuICB9LFxyXG4gIGNvbnZlcnRUb1JlbGF0aXZlQmVuZFBvc2l0aW9uczogZnVuY3Rpb24gKGVkZ2UsIGJlbmRQb2ludHMpIHtcclxuICAgIHZhciBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cyA9IHRoaXMuZ2V0U3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMoZWRnZSk7XHJcbi8vICAgIHZhciBiZW5kUG9pbnRzID0gZWRnZS5kYXRhKCdiZW5kUG9pbnRQb3NpdGlvbnMnKTtcclxuICAgIC8vb3V0cHV0IHZhcmlhYmxlc1xyXG4gICAgdmFyIHdlaWdodHMgPSBbXTtcclxuICAgIHZhciBkaXN0YW5jZXMgPSBbXTtcclxuXHJcbiAgICBmb3IgKHZhciBpID0gMDsgYmVuZFBvaW50cyAmJiBpIDwgYmVuZFBvaW50cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICB2YXIgYmVuZFBvaW50ID0gYmVuZFBvaW50c1tpXTtcclxuICAgICAgdmFyIHJlbGF0aXZlQmVuZFBvc2l0aW9uID0gdGhpcy5jb252ZXJ0VG9SZWxhdGl2ZUJlbmRQb3NpdGlvbihlZGdlLCBiZW5kUG9pbnQsIHNyY1RndFBvaW50c0FuZFRhbmdlbnRzKTtcclxuXHJcbiAgICAgIHdlaWdodHMucHVzaChyZWxhdGl2ZUJlbmRQb3NpdGlvbi53ZWlnaHQpO1xyXG4gICAgICBkaXN0YW5jZXMucHVzaChyZWxhdGl2ZUJlbmRQb3NpdGlvbi5kaXN0YW5jZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgd2VpZ2h0czogd2VpZ2h0cyxcclxuICAgICAgZGlzdGFuY2VzOiBkaXN0YW5jZXNcclxuICAgIH07XHJcbiAgfSxcclxuICBnZXRTZWdtZW50RGlzdGFuY2VzU3RyaW5nOiBmdW5jdGlvbiAoZWRnZSkge1xyXG4gICAgdmFyIHN0ciA9IFwiXCI7XHJcblxyXG4gICAgdmFyIGRpc3RhbmNlcyA9IGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdEaXN0YW5jZXMnKTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBkaXN0YW5jZXMgJiYgaSA8IGRpc3RhbmNlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICBzdHIgPSBzdHIgKyBcIiBcIiArIGRpc3RhbmNlc1tpXTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHN0cjtcclxuICB9LFxyXG4gIGdldFNlZ21lbnRXZWlnaHRzU3RyaW5nOiBmdW5jdGlvbiAoZWRnZSkge1xyXG4gICAgdmFyIHN0ciA9IFwiXCI7XHJcblxyXG4gICAgdmFyIHdlaWdodHMgPSBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycpO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IHdlaWdodHMgJiYgaSA8IHdlaWdodHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgc3RyID0gc3RyICsgXCIgXCIgKyB3ZWlnaHRzW2ldO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gc3RyO1xyXG4gIH0sXHJcbiAgYWRkQmVuZFBvaW50OiBmdW5jdGlvbihlZGdlLCBuZXdCZW5kUG9pbnQpIHtcclxuICAgIGlmKGVkZ2UgPT09IHVuZGVmaW5lZCB8fCBuZXdCZW5kUG9pbnQgPT09IHVuZGVmaW5lZCl7XHJcbiAgICAgIGVkZ2UgPSB0aGlzLmN1cnJlbnRDdHhFZGdlO1xyXG4gICAgICBuZXdCZW5kUG9pbnQgPSB0aGlzLmN1cnJlbnRDdHhQb3M7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciByZWxhdGl2ZUJlbmRQb3NpdGlvbiA9IHRoaXMuY29udmVydFRvUmVsYXRpdmVCZW5kUG9zaXRpb24oZWRnZSwgbmV3QmVuZFBvaW50KTtcclxuICAgIHZhciBvcmlnaW5hbFBvaW50V2VpZ2h0ID0gcmVsYXRpdmVCZW5kUG9zaXRpb24ud2VpZ2h0O1xyXG4gICAgXHJcbiAgICB2YXIgc3RhcnRYID0gZWRnZS5zb3VyY2UoKS5wb3NpdGlvbigneCcpO1xyXG4gICAgdmFyIHN0YXJ0WSA9IGVkZ2Uuc291cmNlKCkucG9zaXRpb24oJ3knKTtcclxuICAgIHZhciBlbmRYID0gZWRnZS50YXJnZXQoKS5wb3NpdGlvbigneCcpO1xyXG4gICAgdmFyIGVuZFkgPSBlZGdlLnRhcmdldCgpLnBvc2l0aW9uKCd5Jyk7XHJcbiAgICBcclxuICAgIHZhciBzdGFydFdlaWdodCA9IHRoaXMuY29udmVydFRvUmVsYXRpdmVCZW5kUG9zaXRpb24oZWRnZSwge3g6IHN0YXJ0WCwgeTogc3RhcnRZfSkud2VpZ2h0O1xyXG4gICAgdmFyIGVuZFdlaWdodCA9IHRoaXMuY29udmVydFRvUmVsYXRpdmVCZW5kUG9zaXRpb24oZWRnZSwge3g6IGVuZFgsIHk6IGVuZFl9KS53ZWlnaHQ7XHJcbiAgICB2YXIgd2VpZ2h0c1dpdGhUZ3RTcmMgPSBbc3RhcnRXZWlnaHRdLmNvbmNhdChlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycpP2VkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzJyk6W10pLmNvbmNhdChbZW5kV2VpZ2h0XSk7XHJcbiAgICBcclxuICAgIHZhciBzZWdQdHMgPSB0aGlzLmdldFNlZ21lbnRQb2ludHMoZWRnZSk7XHJcbiAgICBcclxuICAgIHZhciBtaW5EaXN0ID0gSW5maW5pdHk7XHJcbiAgICB2YXIgaW50ZXJzZWN0aW9uO1xyXG4gICAgdmFyIHNlZ3B0c1dpdGhUZ3RTcmMgPSBbc3RhcnRYLCBzdGFydFldXHJcbiAgICAgICAgICAgIC5jb25jYXQoc2VnUHRzP3NlZ1B0czpbXSlcclxuICAgICAgICAgICAgLmNvbmNhdChbZW5kWCwgZW5kWV0pO1xyXG4gICAgdmFyIG5ld0JlbmRJbmRleCA9IC0xO1xyXG4gICAgXHJcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgd2VpZ2h0c1dpdGhUZ3RTcmMubGVuZ3RoIC0gMTsgaSsrKXtcclxuICAgICAgdmFyIHcxID0gd2VpZ2h0c1dpdGhUZ3RTcmNbaV07XHJcbiAgICAgIHZhciB3MiA9IHdlaWdodHNXaXRoVGd0U3JjW2kgKyAxXTtcclxuICAgICAgXHJcbiAgICAgIC8vY2hlY2sgaWYgdGhlIHdlaWdodCBpcyBiZXR3ZWVuIHcxIGFuZCB3MlxyXG4gICAgICBpZigob3JpZ2luYWxQb2ludFdlaWdodCA8PSB3MSAmJiBvcmlnaW5hbFBvaW50V2VpZ2h0ID49IHcyKSB8fCAob3JpZ2luYWxQb2ludFdlaWdodCA8PSB3MiAmJiBvcmlnaW5hbFBvaW50V2VpZ2h0ID49IHcxKSl7XHJcbiAgICAgICAgdmFyIHN0YXJ0WCA9IHNlZ3B0c1dpdGhUZ3RTcmNbMiAqIGldO1xyXG4gICAgICAgIHZhciBzdGFydFkgPSBzZWdwdHNXaXRoVGd0U3JjWzIgKiBpICsgMV07XHJcbiAgICAgICAgdmFyIGVuZFggPSBzZWdwdHNXaXRoVGd0U3JjWzIgKiBpICsgMl07XHJcbiAgICAgICAgdmFyIGVuZFkgPSBzZWdwdHNXaXRoVGd0U3JjWzIgKiBpICsgM107XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN0YXJ0ID0ge1xyXG4gICAgICAgICAgeDogc3RhcnRYLFxyXG4gICAgICAgICAgeTogc3RhcnRZXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZW5kID0ge1xyXG4gICAgICAgICAgeDogZW5kWCxcclxuICAgICAgICAgIHk6IGVuZFlcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtMSA9ICggc3RhcnRZIC0gZW5kWSApIC8gKCBzdGFydFggLSBlbmRYICk7XHJcbiAgICAgICAgdmFyIG0yID0gLTEgLyBtMTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMgPSB7XHJcbiAgICAgICAgICBzcmNQb2ludDogc3RhcnQsXHJcbiAgICAgICAgICB0Z3RQb2ludDogZW5kLFxyXG4gICAgICAgICAgbTE6IG0xLFxyXG4gICAgICAgICAgbTI6IG0yXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICAvL2dldCB0aGUgaW50ZXJzZWN0aW9uIG9mIHRoZSBjdXJyZW50IHNlZ21lbnQgd2l0aCB0aGUgbmV3IGJlbmQgcG9pbnRcclxuICAgICAgICB2YXIgY3VycmVudEludGVyc2VjdGlvbiA9IHRoaXMuZ2V0SW50ZXJzZWN0aW9uKGVkZ2UsIG5ld0JlbmRQb2ludCwgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMpO1xyXG4gICAgICAgIHZhciBkaXN0ID0gTWF0aC5zcXJ0KCBNYXRoLnBvdyggKG5ld0JlbmRQb2ludC54IC0gY3VycmVudEludGVyc2VjdGlvbi54KSwgMiApIFxyXG4gICAgICAgICAgICAgICAgKyBNYXRoLnBvdyggKG5ld0JlbmRQb2ludC55IC0gY3VycmVudEludGVyc2VjdGlvbi55KSwgMiApKTtcclxuICAgICAgICBcclxuICAgICAgICAvL1VwZGF0ZSB0aGUgbWluaW11bSBkaXN0YW5jZVxyXG4gICAgICAgIGlmKGRpc3QgPCBtaW5EaXN0KXtcclxuICAgICAgICAgIG1pbkRpc3QgPSBkaXN0O1xyXG4gICAgICAgICAgaW50ZXJzZWN0aW9uID0gY3VycmVudEludGVyc2VjdGlvbjtcclxuICAgICAgICAgIG5ld0JlbmRJbmRleCA9IGk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmKGludGVyc2VjdGlvbiAhPT0gdW5kZWZpbmVkKXtcclxuICAgICAgbmV3QmVuZFBvaW50ID0gaW50ZXJzZWN0aW9uO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZWxhdGl2ZUJlbmRQb3NpdGlvbiA9IHRoaXMuY29udmVydFRvUmVsYXRpdmVCZW5kUG9zaXRpb24oZWRnZSwgbmV3QmVuZFBvaW50KTtcclxuICAgIFxyXG4gICAgaWYoaW50ZXJzZWN0aW9uID09PSB1bmRlZmluZWQpe1xyXG4gICAgICByZWxhdGl2ZUJlbmRQb3NpdGlvbi5kaXN0YW5jZSA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHdlaWdodHMgPSBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycpO1xyXG4gICAgdmFyIGRpc3RhbmNlcyA9IGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdEaXN0YW5jZXMnKTtcclxuICAgIFxyXG4gICAgd2VpZ2h0cyA9IHdlaWdodHM/d2VpZ2h0czpbXTtcclxuICAgIGRpc3RhbmNlcyA9IGRpc3RhbmNlcz9kaXN0YW5jZXM6W107XHJcbiAgICBcclxuICAgIGlmKHdlaWdodHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIG5ld0JlbmRJbmRleCA9IDA7XHJcbiAgICB9XHJcbiAgICBcclxuLy8gICAgd2VpZ2h0cy5wdXNoKHJlbGF0aXZlQmVuZFBvc2l0aW9uLndlaWdodCk7XHJcbi8vICAgIGRpc3RhbmNlcy5wdXNoKHJlbGF0aXZlQmVuZFBvc2l0aW9uLmRpc3RhbmNlKTtcclxuICAgIGlmKG5ld0JlbmRJbmRleCAhPSAtMSl7XHJcbiAgICAgIHdlaWdodHMuc3BsaWNlKG5ld0JlbmRJbmRleCwgMCwgcmVsYXRpdmVCZW5kUG9zaXRpb24ud2VpZ2h0KTtcclxuICAgICAgZGlzdGFuY2VzLnNwbGljZShuZXdCZW5kSW5kZXgsIDAsIHJlbGF0aXZlQmVuZFBvc2l0aW9uLmRpc3RhbmNlKTtcclxuICAgIH1cclxuICAgXHJcbiAgICBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycsIHdlaWdodHMpO1xyXG4gICAgZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ0Rpc3RhbmNlcycsIGRpc3RhbmNlcyk7XHJcbiAgICBcclxuICAgIGVkZ2UuYWRkQ2xhc3MoJ2VkZ2ViZW5kZWRpdGluZy1oYXNiZW5kcG9pbnRzJyk7XHJcbiAgICBcclxuICAgIHJldHVybiByZWxhdGl2ZUJlbmRQb3NpdGlvbjtcclxuICB9LFxyXG4gIHJlbW92ZUJlbmRQb2ludDogZnVuY3Rpb24oZWRnZSwgYmVuZFBvaW50SW5kZXgpe1xyXG4gICAgaWYoZWRnZSA9PT0gdW5kZWZpbmVkIHx8IGJlbmRQb2ludEluZGV4ID09PSB1bmRlZmluZWQpe1xyXG4gICAgICBlZGdlID0gdGhpcy5jdXJyZW50Q3R4RWRnZTtcclxuICAgICAgYmVuZFBvaW50SW5kZXggPSB0aGlzLmN1cnJlbnRCZW5kSW5kZXg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBkaXN0YW5jZXMgPSBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nRGlzdGFuY2VzJyk7XHJcbiAgICB2YXIgd2VpZ2h0cyA9IGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzJyk7XHJcbiAgICBcclxuICAgIGRpc3RhbmNlcy5zcGxpY2UoYmVuZFBvaW50SW5kZXgsIDEpO1xyXG4gICAgd2VpZ2h0cy5zcGxpY2UoYmVuZFBvaW50SW5kZXgsIDEpO1xyXG4gICAgXHJcbiAgICBcclxuICAgIGlmKGRpc3RhbmNlcy5sZW5ndGggPT0gMCB8fCB3ZWlnaHRzLmxlbmd0aCA9PSAwKXtcclxuICAgICAgZWRnZS5yZW1vdmVDbGFzcygnZWRnZWJlbmRlZGl0aW5nLWhhc2JlbmRwb2ludHMnKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nRGlzdGFuY2VzJywgZGlzdGFuY2VzKTtcclxuICAgICAgZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ1dlaWdodHMnLCB3ZWlnaHRzKTtcclxuICAgIH1cclxuICB9LFxyXG4gIGNhbGN1bGF0ZURpc3RhbmNlOiBmdW5jdGlvbihwdDEsIHB0Mikge1xyXG4gICAgdmFyIGRpZmZYID0gcHQxLnggLSBwdDIueDtcclxuICAgIHZhciBkaWZmWSA9IHB0MS55IC0gcHQyLnk7XHJcbiAgICBcclxuICAgIHZhciBkaXN0ID0gTWF0aC5zcXJ0KCBNYXRoLnBvdyggZGlmZlgsIDIgKSArIE1hdGgucG93KCBkaWZmWSwgMiApICk7XHJcbiAgICByZXR1cm4gZGlzdDtcclxuICB9LFxyXG4gIGdldFdlaWdodHNOYW1lOiBmdW5jdGlvbihjdXJ2ZVN0eWxlKSB7XHJcbiAgICByZXR1cm4gY3VydmVTdHlsZSA9PT0gJ3NlZ21lbnRzJyA/ICdzZWdtZW50LXdlaWdodHMnIDogJ2NvbnRyb2wtcG9pbnQtd2VpZ2h0cyc7XHJcbiAgfSxcclxuICBnZXREaXN0YW5jZXNOYW1lOiBmdW5jdGlvbihjdXJ2ZVN0eWxlKSB7XHJcbiAgICByZXR1cm4gY3VydmVTdHlsZSA9PT0gJ3NlZ21lbnRzJyA/ICdzZWdtZW50LWRpc3RhbmNlcycgOiAnY29udHJvbC1wb2ludC1kaXN0YW5jZXMnO1xyXG4gIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gYmVuZFBvaW50VXRpbGl0aWVzO1xyXG4iLCJ2YXIgZGVib3VuY2UgPSAoZnVuY3Rpb24gKCkge1xyXG4gIC8qKlxyXG4gICAqIGxvZGFzaCAzLjEuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cclxuICAgKiBCdWlsZDogYGxvZGFzaCBtb2Rlcm4gbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXHJcbiAgICogQ29weXJpZ2h0IDIwMTItMjAxNSBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cclxuICAgKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuOC4zIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxyXG4gICAqIENvcHlyaWdodCAyMDA5LTIwMTUgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcclxuICAgKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxyXG4gICAqL1xyXG4gIC8qKiBVc2VkIGFzIHRoZSBgVHlwZUVycm9yYCBtZXNzYWdlIGZvciBcIkZ1bmN0aW9uc1wiIG1ldGhvZHMuICovXHJcbiAgdmFyIEZVTkNfRVJST1JfVEVYVCA9ICdFeHBlY3RlZCBhIGZ1bmN0aW9uJztcclxuXHJcbiAgLyogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzIGZvciB0aG9zZSB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcy4gKi9cclxuICB2YXIgbmF0aXZlTWF4ID0gTWF0aC5tYXgsXHJcbiAgICAgICAgICBuYXRpdmVOb3cgPSBEYXRlLm5vdztcclxuXHJcbiAgLyoqXHJcbiAgICogR2V0cyB0aGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0aGF0IGhhdmUgZWxhcHNlZCBzaW5jZSB0aGUgVW5peCBlcG9jaFxyXG4gICAqICgxIEphbnVhcnkgMTk3MCAwMDowMDowMCBVVEMpLlxyXG4gICAqXHJcbiAgICogQHN0YXRpY1xyXG4gICAqIEBtZW1iZXJPZiBfXHJcbiAgICogQGNhdGVnb3J5IERhdGVcclxuICAgKiBAZXhhbXBsZVxyXG4gICAqXHJcbiAgICogXy5kZWZlcihmdW5jdGlvbihzdGFtcCkge1xyXG4gICAqICAgY29uc29sZS5sb2coXy5ub3coKSAtIHN0YW1wKTtcclxuICAgKiB9LCBfLm5vdygpKTtcclxuICAgKiAvLyA9PiBsb2dzIHRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIGl0IHRvb2sgZm9yIHRoZSBkZWZlcnJlZCBmdW5jdGlvbiB0byBiZSBpbnZva2VkXHJcbiAgICovXHJcbiAgdmFyIG5vdyA9IG5hdGl2ZU5vdyB8fCBmdW5jdGlvbiAoKSB7XHJcbiAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCk7XHJcbiAgfTtcclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlcyBhIGRlYm91bmNlZCBmdW5jdGlvbiB0aGF0IGRlbGF5cyBpbnZva2luZyBgZnVuY2AgdW50aWwgYWZ0ZXIgYHdhaXRgXHJcbiAgICogbWlsbGlzZWNvbmRzIGhhdmUgZWxhcHNlZCBzaW5jZSB0aGUgbGFzdCB0aW1lIHRoZSBkZWJvdW5jZWQgZnVuY3Rpb24gd2FzXHJcbiAgICogaW52b2tlZC4gVGhlIGRlYm91bmNlZCBmdW5jdGlvbiBjb21lcyB3aXRoIGEgYGNhbmNlbGAgbWV0aG9kIHRvIGNhbmNlbFxyXG4gICAqIGRlbGF5ZWQgaW52b2NhdGlvbnMuIFByb3ZpZGUgYW4gb3B0aW9ucyBvYmplY3QgdG8gaW5kaWNhdGUgdGhhdCBgZnVuY2BcclxuICAgKiBzaG91bGQgYmUgaW52b2tlZCBvbiB0aGUgbGVhZGluZyBhbmQvb3IgdHJhaWxpbmcgZWRnZSBvZiB0aGUgYHdhaXRgIHRpbWVvdXQuXHJcbiAgICogU3Vic2VxdWVudCBjYWxscyB0byB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uIHJldHVybiB0aGUgcmVzdWx0IG9mIHRoZSBsYXN0XHJcbiAgICogYGZ1bmNgIGludm9jYXRpb24uXHJcbiAgICpcclxuICAgKiAqKk5vdGU6KiogSWYgYGxlYWRpbmdgIGFuZCBgdHJhaWxpbmdgIG9wdGlvbnMgYXJlIGB0cnVlYCwgYGZ1bmNgIGlzIGludm9rZWRcclxuICAgKiBvbiB0aGUgdHJhaWxpbmcgZWRnZSBvZiB0aGUgdGltZW91dCBvbmx5IGlmIHRoZSB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uIGlzXHJcbiAgICogaW52b2tlZCBtb3JlIHRoYW4gb25jZSBkdXJpbmcgdGhlIGB3YWl0YCB0aW1lb3V0LlxyXG4gICAqXHJcbiAgICogU2VlIFtEYXZpZCBDb3JiYWNobydzIGFydGljbGVdKGh0dHA6Ly9kcnVwYWxtb3Rpb24uY29tL2FydGljbGUvZGVib3VuY2UtYW5kLXRocm90dGxlLXZpc3VhbC1leHBsYW5hdGlvbilcclxuICAgKiBmb3IgZGV0YWlscyBvdmVyIHRoZSBkaWZmZXJlbmNlcyBiZXR3ZWVuIGBfLmRlYm91bmNlYCBhbmQgYF8udGhyb3R0bGVgLlxyXG4gICAqXHJcbiAgICogQHN0YXRpY1xyXG4gICAqIEBtZW1iZXJPZiBfXHJcbiAgICogQGNhdGVnb3J5IEZ1bmN0aW9uXHJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gZGVib3VuY2UuXHJcbiAgICogQHBhcmFtIHtudW1iZXJ9IFt3YWl0PTBdIFRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIGRlbGF5LlxyXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gVGhlIG9wdGlvbnMgb2JqZWN0LlxyXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMubGVhZGluZz1mYWxzZV0gU3BlY2lmeSBpbnZva2luZyBvbiB0aGUgbGVhZGluZ1xyXG4gICAqICBlZGdlIG9mIHRoZSB0aW1lb3V0LlxyXG4gICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5tYXhXYWl0XSBUaGUgbWF4aW11bSB0aW1lIGBmdW5jYCBpcyBhbGxvd2VkIHRvIGJlXHJcbiAgICogIGRlbGF5ZWQgYmVmb3JlIGl0J3MgaW52b2tlZC5cclxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnRyYWlsaW5nPXRydWVdIFNwZWNpZnkgaW52b2tpbmcgb24gdGhlIHRyYWlsaW5nXHJcbiAgICogIGVkZ2Ugb2YgdGhlIHRpbWVvdXQuXHJcbiAgICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZGVib3VuY2VkIGZ1bmN0aW9uLlxyXG4gICAqIEBleGFtcGxlXHJcbiAgICpcclxuICAgKiAvLyBhdm9pZCBjb3N0bHkgY2FsY3VsYXRpb25zIHdoaWxlIHRoZSB3aW5kb3cgc2l6ZSBpcyBpbiBmbHV4XHJcbiAgICogalF1ZXJ5KHdpbmRvdykub24oJ3Jlc2l6ZScsIF8uZGVib3VuY2UoY2FsY3VsYXRlTGF5b3V0LCAxNTApKTtcclxuICAgKlxyXG4gICAqIC8vIGludm9rZSBgc2VuZE1haWxgIHdoZW4gdGhlIGNsaWNrIGV2ZW50IGlzIGZpcmVkLCBkZWJvdW5jaW5nIHN1YnNlcXVlbnQgY2FsbHNcclxuICAgKiBqUXVlcnkoJyNwb3N0Ym94Jykub24oJ2NsaWNrJywgXy5kZWJvdW5jZShzZW5kTWFpbCwgMzAwLCB7XHJcbiAgICogICAnbGVhZGluZyc6IHRydWUsXHJcbiAgICogICAndHJhaWxpbmcnOiBmYWxzZVxyXG4gICAqIH0pKTtcclxuICAgKlxyXG4gICAqIC8vIGVuc3VyZSBgYmF0Y2hMb2dgIGlzIGludm9rZWQgb25jZSBhZnRlciAxIHNlY29uZCBvZiBkZWJvdW5jZWQgY2FsbHNcclxuICAgKiB2YXIgc291cmNlID0gbmV3IEV2ZW50U291cmNlKCcvc3RyZWFtJyk7XHJcbiAgICogalF1ZXJ5KHNvdXJjZSkub24oJ21lc3NhZ2UnLCBfLmRlYm91bmNlKGJhdGNoTG9nLCAyNTAsIHtcclxuICAgKiAgICdtYXhXYWl0JzogMTAwMFxyXG4gICAqIH0pKTtcclxuICAgKlxyXG4gICAqIC8vIGNhbmNlbCBhIGRlYm91bmNlZCBjYWxsXHJcbiAgICogdmFyIHRvZG9DaGFuZ2VzID0gXy5kZWJvdW5jZShiYXRjaExvZywgMTAwMCk7XHJcbiAgICogT2JqZWN0Lm9ic2VydmUobW9kZWxzLnRvZG8sIHRvZG9DaGFuZ2VzKTtcclxuICAgKlxyXG4gICAqIE9iamVjdC5vYnNlcnZlKG1vZGVscywgZnVuY3Rpb24oY2hhbmdlcykge1xyXG4gICAqICAgaWYgKF8uZmluZChjaGFuZ2VzLCB7ICd1c2VyJzogJ3RvZG8nLCAndHlwZSc6ICdkZWxldGUnfSkpIHtcclxuICAgKiAgICAgdG9kb0NoYW5nZXMuY2FuY2VsKCk7XHJcbiAgICogICB9XHJcbiAgICogfSwgWydkZWxldGUnXSk7XHJcbiAgICpcclxuICAgKiAvLyAuLi5hdCBzb21lIHBvaW50IGBtb2RlbHMudG9kb2AgaXMgY2hhbmdlZFxyXG4gICAqIG1vZGVscy50b2RvLmNvbXBsZXRlZCA9IHRydWU7XHJcbiAgICpcclxuICAgKiAvLyAuLi5iZWZvcmUgMSBzZWNvbmQgaGFzIHBhc3NlZCBgbW9kZWxzLnRvZG9gIGlzIGRlbGV0ZWRcclxuICAgKiAvLyB3aGljaCBjYW5jZWxzIHRoZSBkZWJvdW5jZWQgYHRvZG9DaGFuZ2VzYCBjYWxsXHJcbiAgICogZGVsZXRlIG1vZGVscy50b2RvO1xyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIGRlYm91bmNlKGZ1bmMsIHdhaXQsIG9wdGlvbnMpIHtcclxuICAgIHZhciBhcmdzLFxyXG4gICAgICAgICAgICBtYXhUaW1lb3V0SWQsXHJcbiAgICAgICAgICAgIHJlc3VsdCxcclxuICAgICAgICAgICAgc3RhbXAsXHJcbiAgICAgICAgICAgIHRoaXNBcmcsXHJcbiAgICAgICAgICAgIHRpbWVvdXRJZCxcclxuICAgICAgICAgICAgdHJhaWxpbmdDYWxsLFxyXG4gICAgICAgICAgICBsYXN0Q2FsbGVkID0gMCxcclxuICAgICAgICAgICAgbWF4V2FpdCA9IGZhbHNlLFxyXG4gICAgICAgICAgICB0cmFpbGluZyA9IHRydWU7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBmdW5jICE9ICdmdW5jdGlvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihGVU5DX0VSUk9SX1RFWFQpO1xyXG4gICAgfVxyXG4gICAgd2FpdCA9IHdhaXQgPCAwID8gMCA6ICgrd2FpdCB8fCAwKTtcclxuICAgIGlmIChvcHRpb25zID09PSB0cnVlKSB7XHJcbiAgICAgIHZhciBsZWFkaW5nID0gdHJ1ZTtcclxuICAgICAgdHJhaWxpbmcgPSBmYWxzZTtcclxuICAgIH0gZWxzZSBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcclxuICAgICAgbGVhZGluZyA9ICEhb3B0aW9ucy5sZWFkaW5nO1xyXG4gICAgICBtYXhXYWl0ID0gJ21heFdhaXQnIGluIG9wdGlvbnMgJiYgbmF0aXZlTWF4KCtvcHRpb25zLm1heFdhaXQgfHwgMCwgd2FpdCk7XHJcbiAgICAgIHRyYWlsaW5nID0gJ3RyYWlsaW5nJyBpbiBvcHRpb25zID8gISFvcHRpb25zLnRyYWlsaW5nIDogdHJhaWxpbmc7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gY2FuY2VsKCkge1xyXG4gICAgICBpZiAodGltZW91dElkKSB7XHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKG1heFRpbWVvdXRJZCkge1xyXG4gICAgICAgIGNsZWFyVGltZW91dChtYXhUaW1lb3V0SWQpO1xyXG4gICAgICB9XHJcbiAgICAgIGxhc3RDYWxsZWQgPSAwO1xyXG4gICAgICBtYXhUaW1lb3V0SWQgPSB0aW1lb3V0SWQgPSB0cmFpbGluZ0NhbGwgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gY29tcGxldGUoaXNDYWxsZWQsIGlkKSB7XHJcbiAgICAgIGlmIChpZCkge1xyXG4gICAgICAgIGNsZWFyVGltZW91dChpZCk7XHJcbiAgICAgIH1cclxuICAgICAgbWF4VGltZW91dElkID0gdGltZW91dElkID0gdHJhaWxpbmdDYWxsID0gdW5kZWZpbmVkO1xyXG4gICAgICBpZiAoaXNDYWxsZWQpIHtcclxuICAgICAgICBsYXN0Q2FsbGVkID0gbm93KCk7XHJcbiAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmdzKTtcclxuICAgICAgICBpZiAoIXRpbWVvdXRJZCAmJiAhbWF4VGltZW91dElkKSB7XHJcbiAgICAgICAgICBhcmdzID0gdGhpc0FyZyA9IHVuZGVmaW5lZDtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkZWxheWVkKCkge1xyXG4gICAgICB2YXIgcmVtYWluaW5nID0gd2FpdCAtIChub3coKSAtIHN0YW1wKTtcclxuICAgICAgaWYgKHJlbWFpbmluZyA8PSAwIHx8IHJlbWFpbmluZyA+IHdhaXQpIHtcclxuICAgICAgICBjb21wbGV0ZSh0cmFpbGluZ0NhbGwsIG1heFRpbWVvdXRJZCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGltZW91dElkID0gc2V0VGltZW91dChkZWxheWVkLCByZW1haW5pbmcpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gbWF4RGVsYXllZCgpIHtcclxuICAgICAgY29tcGxldGUodHJhaWxpbmcsIHRpbWVvdXRJZCk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZGVib3VuY2VkKCkge1xyXG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xyXG4gICAgICBzdGFtcCA9IG5vdygpO1xyXG4gICAgICB0aGlzQXJnID0gdGhpcztcclxuICAgICAgdHJhaWxpbmdDYWxsID0gdHJhaWxpbmcgJiYgKHRpbWVvdXRJZCB8fCAhbGVhZGluZyk7XHJcblxyXG4gICAgICBpZiAobWF4V2FpdCA9PT0gZmFsc2UpIHtcclxuICAgICAgICB2YXIgbGVhZGluZ0NhbGwgPSBsZWFkaW5nICYmICF0aW1lb3V0SWQ7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaWYgKCFtYXhUaW1lb3V0SWQgJiYgIWxlYWRpbmcpIHtcclxuICAgICAgICAgIGxhc3RDYWxsZWQgPSBzdGFtcDtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIHJlbWFpbmluZyA9IG1heFdhaXQgLSAoc3RhbXAgLSBsYXN0Q2FsbGVkKSxcclxuICAgICAgICAgICAgICAgIGlzQ2FsbGVkID0gcmVtYWluaW5nIDw9IDAgfHwgcmVtYWluaW5nID4gbWF4V2FpdDtcclxuXHJcbiAgICAgICAgaWYgKGlzQ2FsbGVkKSB7XHJcbiAgICAgICAgICBpZiAobWF4VGltZW91dElkKSB7XHJcbiAgICAgICAgICAgIG1heFRpbWVvdXRJZCA9IGNsZWFyVGltZW91dChtYXhUaW1lb3V0SWQpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgbGFzdENhbGxlZCA9IHN0YW1wO1xyXG4gICAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmdzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoIW1heFRpbWVvdXRJZCkge1xyXG4gICAgICAgICAgbWF4VGltZW91dElkID0gc2V0VGltZW91dChtYXhEZWxheWVkLCByZW1haW5pbmcpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBpZiAoaXNDYWxsZWQgJiYgdGltZW91dElkKSB7XHJcbiAgICAgICAgdGltZW91dElkID0gY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSBpZiAoIXRpbWVvdXRJZCAmJiB3YWl0ICE9PSBtYXhXYWl0KSB7XHJcbiAgICAgICAgdGltZW91dElkID0gc2V0VGltZW91dChkZWxheWVkLCB3YWl0KTtcclxuICAgICAgfVxyXG4gICAgICBpZiAobGVhZGluZ0NhbGwpIHtcclxuICAgICAgICBpc0NhbGxlZCA9IHRydWU7XHJcbiAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmdzKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoaXNDYWxsZWQgJiYgIXRpbWVvdXRJZCAmJiAhbWF4VGltZW91dElkKSB7XHJcbiAgICAgICAgYXJncyA9IHRoaXNBcmcgPSB1bmRlZmluZWQ7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBkZWJvdW5jZWQuY2FuY2VsID0gY2FuY2VsO1xyXG4gICAgcmV0dXJuIGRlYm91bmNlZDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHRoZSBbbGFuZ3VhZ2UgdHlwZV0oaHR0cHM6Ly9lczUuZ2l0aHViLmlvLyN4OCkgb2YgYE9iamVjdGAuXHJcbiAgICogKGUuZy4gYXJyYXlzLCBmdW5jdGlvbnMsIG9iamVjdHMsIHJlZ2V4ZXMsIGBuZXcgTnVtYmVyKDApYCwgYW5kIGBuZXcgU3RyaW5nKCcnKWApXHJcbiAgICpcclxuICAgKiBAc3RhdGljXHJcbiAgICogQG1lbWJlck9mIF9cclxuICAgKiBAY2F0ZWdvcnkgTGFuZ1xyXG4gICAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxyXG4gICAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFuIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxyXG4gICAqIEBleGFtcGxlXHJcbiAgICpcclxuICAgKiBfLmlzT2JqZWN0KHt9KTtcclxuICAgKiAvLyA9PiB0cnVlXHJcbiAgICpcclxuICAgKiBfLmlzT2JqZWN0KFsxLCAyLCAzXSk7XHJcbiAgICogLy8gPT4gdHJ1ZVxyXG4gICAqXHJcbiAgICogXy5pc09iamVjdCgxKTtcclxuICAgKiAvLyA9PiBmYWxzZVxyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XHJcbiAgICAvLyBBdm9pZCBhIFY4IEpJVCBidWcgaW4gQ2hyb21lIDE5LTIwLlxyXG4gICAgLy8gU2VlIGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0yMjkxIGZvciBtb3JlIGRldGFpbHMuXHJcbiAgICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcclxuICAgIHJldHVybiAhIXZhbHVlICYmICh0eXBlID09ICdvYmplY3QnIHx8IHR5cGUgPT0gJ2Z1bmN0aW9uJyk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gZGVib3VuY2U7XHJcblxyXG59KSgpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBkZWJvdW5jZTsiLCI7KGZ1bmN0aW9uKCl7ICd1c2Ugc3RyaWN0JztcclxuICBcclxuICB2YXIgYmVuZFBvaW50VXRpbGl0aWVzID0gcmVxdWlyZSgnLi9iZW5kUG9pbnRVdGlsaXRpZXMnKTtcclxuICB2YXIgZGVib3VuY2UgPSByZXF1aXJlKFwiLi9kZWJvdW5jZVwiKTtcclxuICBcclxuICAvLyByZWdpc3RlcnMgdGhlIGV4dGVuc2lvbiBvbiBhIGN5dG9zY2FwZSBsaWIgcmVmXHJcbiAgdmFyIHJlZ2lzdGVyID0gZnVuY3Rpb24oIGN5dG9zY2FwZSwgJCApe1xyXG4gICAgdmFyIHVpVXRpbGl0aWVzID0gcmVxdWlyZSgnLi9VSVV0aWxpdGllcycpO1xyXG4gICAgXHJcbiAgICBpZiggIWN5dG9zY2FwZSApeyByZXR1cm47IH0gLy8gY2FuJ3QgcmVnaXN0ZXIgaWYgY3l0b3NjYXBlIHVuc3BlY2lmaWVkXHJcblxyXG4gICAgdmFyIGRlZmF1bHRzID0ge1xyXG4gICAgICAvLyB0aGlzIGZ1bmN0aW9uIHNwZWNpZmllcyB0aGUgcG9pdGlvbnMgb2YgYmVuZCBwb2ludHNcclxuICAgICAgYmVuZFBvc2l0aW9uc0Z1bmN0aW9uOiBmdW5jdGlvbihlbGUpIHtcclxuICAgICAgICByZXR1cm4gZWxlLmRhdGEoJ2JlbmRQb2ludFBvc2l0aW9ucycpO1xyXG4gICAgICB9LFxyXG4gICAgICAvLyB3aGV0aGVyIHRvIGluaXRpbGl6ZSBiZW5kIHBvaW50cyBvbiBjcmVhdGlvbiBvZiB0aGlzIGV4dGVuc2lvbiBhdXRvbWF0aWNhbGx5XHJcbiAgICAgIGluaXRCZW5kUG9pbnRzQXV0b21hdGljYWxseTogdHJ1ZSxcclxuICAgICAgLy8gY3VydmUtc3R5bGUgb2YgdGhlIGJlbnQgZWRnZTsgZWl0aGVyIHNlZ21lbnRzIG9yIHVuYnVuZGxlZC1iZXppZXJcclxuICAgICAgY3VydmVTdHlsZTogXCJzZWdtZW50c1wiLFxyXG4gICAgICAvLyB0aGUgY2xhc3NlcyBvZiB0aG9zZSBlZGdlcyB0aGF0IHNob3VsZCBiZSBpZ25vcmVkXHJcbiAgICAgIGlnbm9yZWRDbGFzc2VzOiBbXSxcclxuICAgICAgLy8gd2hldGhlciB0aGUgYmVuZCBlZGl0aW5nIG9wZXJhdGlvbnMgYXJlIHVuZG9hYmxlIChyZXF1aXJlcyBjeXRvc2NhcGUtdW5kby1yZWRvLmpzKVxyXG4gICAgICB1bmRvYWJsZTogZmFsc2UsXHJcbiAgICAgIC8vIHRoZSBzaXplIG9mIGJlbmQgc2hhcGUgaXMgb2J0YWluZWQgYnkgbXVsdGlwbGluZyB3aWR0aCBvZiBlZGdlIHdpdGggdGhpcyBwYXJhbWV0ZXJcclxuICAgICAgYmVuZFNoYXBlU2l6ZUZhY3RvcjogMyxcclxuICAgICAgLy8gd2hldGhlciB0byBzdGFydCB0aGUgcGx1Z2luIGluIHRoZSBlbmFibGVkIHN0YXRlXHJcbiAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgIC8vIHRpdGxlIG9mIGFkZCBiZW5kIHBvaW50IG1lbnUgaXRlbSAoVXNlciBtYXkgbmVlZCB0byBhZGp1c3Qgd2lkdGggb2YgbWVudSBpdGVtcyBhY2NvcmRpbmcgdG8gbGVuZ3RoIG9mIHRoaXMgb3B0aW9uKVxyXG4gICAgICBhZGRCZW5kTWVudUl0ZW1UaXRsZTogXCJBZGQgQmVuZCBQb2ludFwiLFxyXG4gICAgICAvLyB0aXRsZSBvZiByZW1vdmUgYmVuZCBwb2ludCBtZW51IGl0ZW0gKFVzZXIgbWF5IG5lZWQgdG8gYWRqdXN0IHdpZHRoIG9mIG1lbnUgaXRlbXMgYWNjb3JkaW5nIHRvIGxlbmd0aCBvZiB0aGlzIG9wdGlvbilcclxuICAgICAgcmVtb3ZlQmVuZE1lbnVJdGVtVGl0bGU6IFwiUmVtb3ZlIEJlbmQgUG9pbnRcIlxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdmFyIG9wdGlvbnM7XHJcbiAgICB2YXIgaW5pdGlhbGl6ZWQgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgLy8gTWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgY29taW5nIGZyb20gcGFyYW1ldGVyXHJcbiAgICBmdW5jdGlvbiBleHRlbmQoZGVmYXVsdHMsIG9wdGlvbnMpIHtcclxuICAgICAgdmFyIG9iaiA9IHt9O1xyXG5cclxuICAgICAgZm9yICh2YXIgaSBpbiBkZWZhdWx0cykge1xyXG4gICAgICAgIG9ialtpXSA9IGRlZmF1bHRzW2ldO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmb3IgKHZhciBpIGluIG9wdGlvbnMpIHtcclxuICAgICAgICBvYmpbaV0gPSBvcHRpb25zW2ldO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gb2JqO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgY3l0b3NjYXBlKCAnY29yZScsICdlZGdlQmVuZEVkaXRpbmcnLCBmdW5jdGlvbihvcHRzKXtcclxuICAgICAgdmFyIGN5ID0gdGhpcztcclxuICAgICAgXHJcbiAgICAgIGlmKCBvcHRzID09PSAnaW5pdGlhbGl6ZWQnICkge1xyXG4gICAgICAgIHJldHVybiBpbml0aWFsaXplZDtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYoIG9wdHMgIT09ICdnZXQnICkge1xyXG4gICAgICAgIC8vIG1lcmdlIHRoZSBvcHRpb25zIHdpdGggZGVmYXVsdCBvbmVzXHJcbiAgICAgICAgb3B0aW9ucyA9IGV4dGVuZChkZWZhdWx0cywgb3B0cyk7XHJcbiAgICAgICAgaW5pdGlhbGl6ZWQgPSB0cnVlO1xyXG4gICAgICAgIHZhciBjeUNTU1Byb3BzID0ge1xyXG4gICAgICAgICAgJ2N1cnZlLXN0eWxlJzogb3B0aW9ucy5jdXJ2ZVN0eWxlLFxyXG4gICAgICAgICAgJ2VkZ2UtZGlzdGFuY2VzJzogJ25vZGUtcG9zaXRpb24nXHJcbiAgICAgICAgfTtcclxuICAgICAgICBjeUNTU1Byb3BzW2JlbmRQb2ludFV0aWxpdGllcy5nZXRXZWlnaHRzTmFtZShvcHRpb25zLmN1cnZlU3R5bGUpXSA9IGZ1bmN0aW9uIChlbGUpIHtcclxuICAgICAgICAgIHJldHVybiBiZW5kUG9pbnRVdGlsaXRpZXMuZ2V0U2VnbWVudFdlaWdodHNTdHJpbmcoZWxlKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGN5Q1NTUHJvcHNbYmVuZFBvaW50VXRpbGl0aWVzLmdldERpc3RhbmNlc05hbWUob3B0aW9ucy5jdXJ2ZVN0eWxlKV0gPSBmdW5jdGlvbiAoZWxlKSB7XHJcbiAgICAgICAgICByZXR1cm4gYmVuZFBvaW50VXRpbGl0aWVzLmdldFNlZ21lbnREaXN0YW5jZXNTdHJpbmcoZWxlKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBkZWZpbmUgZWRnZWJlbmRlZGl0aW5nLWhhc2JlbmRwb2ludHMgY3NzIGNsYXNzXHJcbiAgICAgICAgY3kuc3R5bGUoKS5zZWxlY3RvcignLmVkZ2ViZW5kZWRpdGluZy1oYXNiZW5kcG9pbnRzJykuY3NzKGN5Q1NTUHJvcHMpO1xyXG5cclxuICAgICAgICBiZW5kUG9pbnRVdGlsaXRpZXMuc2V0SWdub3JlZENsYXNzZXMob3B0aW9ucy5pZ25vcmVkQ2xhc3Nlcyk7XHJcblxyXG4gICAgICAgIC8vIGluaXQgYmVuZCBwb3NpdGlvbnMgY29uZGl0aW9uYWxseVxyXG4gICAgICAgIGlmIChvcHRpb25zLmluaXRCZW5kUG9pbnRzQXV0b21hdGljYWxseSkge1xyXG4gICAgICAgICAgYmVuZFBvaW50VXRpbGl0aWVzLmluaXRCZW5kUG9pbnRzKG9wdGlvbnMuYmVuZFBvc2l0aW9uc0Z1bmN0aW9uLCBjeS5lZGdlcygpLCBvcHRpb25zLmlnbm9yZWRDbGFzc2VzKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmKG9wdGlvbnMuZW5hYmxlZClcclxuICAgICAgICAgIHVpVXRpbGl0aWVzKG9wdGlvbnMsIGN5KTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICB1aVV0aWxpdGllcyhcInVuYmluZFwiLCBjeSk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHZhciBpbnN0YW5jZSA9IGluaXRpYWxpemVkID8ge1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgKiBnZXQgc2VnbWVudCBwb2ludHMgb2YgdGhlIGdpdmVuIGVkZ2UgaW4gYW4gYXJyYXkgQSxcclxuICAgICAgICAqIEFbMiAqIGldIGlzIHRoZSB4IGNvb3JkaW5hdGUgYW5kIEFbMiAqIGkgKyAxXSBpcyB0aGUgeSBjb29yZGluYXRlXHJcbiAgICAgICAgKiBvZiB0aGUgaXRoIGJlbmQgcG9pbnQuIChSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGUgY3VydmUgc3R5bGUgaXMgbm90IHNlZ21lbnRzKVxyXG4gICAgICAgICovXHJcbiAgICAgICAgZ2V0U2VnbWVudFBvaW50czogZnVuY3Rpb24oZWxlKSB7XHJcbiAgICAgICAgICByZXR1cm4gYmVuZFBvaW50VXRpbGl0aWVzLmdldFNlZ21lbnRQb2ludHMoZWxlKTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vIEluaXRpbGl6ZSBiZW5kIHBvaW50cyBmb3IgdGhlIGdpdmVuIGVkZ2VzIHVzaW5nICdvcHRpb25zLmJlbmRQb3NpdGlvbnNGdW5jdGlvbidcclxuICAgICAgICBpbml0QmVuZFBvaW50czogZnVuY3Rpb24oZWxlcykge1xyXG4gICAgICAgICAgYmVuZFBvaW50VXRpbGl0aWVzLmluaXRCZW5kUG9pbnRzKG9wdGlvbnMuYmVuZFBvc2l0aW9uc0Z1bmN0aW9uLCBlbGVzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgICByZXR1cm4gaW5zdGFuY2U7IC8vIGNoYWluYWJpbGl0eVxyXG4gICAgfSApO1xyXG5cclxuICB9O1xyXG5cclxuICBpZiggdHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMgKXsgLy8gZXhwb3NlIGFzIGEgY29tbW9uanMgbW9kdWxlXHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHJlZ2lzdGVyO1xyXG4gIH1cclxuXHJcbiAgaWYoIHR5cGVvZiBkZWZpbmUgIT09ICd1bmRlZmluZWQnICYmIGRlZmluZS5hbWQgKXsgLy8gZXhwb3NlIGFzIGFuIGFtZC9yZXF1aXJlanMgbW9kdWxlXHJcbiAgICBkZWZpbmUoJ2N5dG9zY2FwZS1lZGdlLWJlbmQtZWRpdGluZycsIGZ1bmN0aW9uKCl7XHJcbiAgICAgIHJldHVybiByZWdpc3RlcjtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgaWYoIHR5cGVvZiBjeXRvc2NhcGUgIT09ICd1bmRlZmluZWQnICYmICQgKXsgLy8gZXhwb3NlIHRvIGdsb2JhbCBjeXRvc2NhcGUgKGkuZS4gd2luZG93LmN5dG9zY2FwZSlcclxuICAgIHJlZ2lzdGVyKCBjeXRvc2NhcGUsICQgKTtcclxuICB9XHJcblxyXG59KSgpO1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjeSkge1xyXG4gIGlmIChjeS51bmRvUmVkbyA9PSBudWxsKVxyXG4gICAgcmV0dXJuO1xyXG5cclxuICB2YXIgdXIgPSBjeS51bmRvUmVkbyh7XHJcbiAgICBkZWZhdWx0QWN0aW9uczogZmFsc2UsXHJcbiAgICBpc0RlYnVnOiB0cnVlXHJcbiAgfSk7XHJcblxyXG4gIGZ1bmN0aW9uIGNoYW5nZUJlbmRQb2ludHMocGFyYW0pIHtcclxuICAgIHZhciBlZGdlID0gcGFyYW0uZWRnZTtcclxuICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgIGVkZ2U6IGVkZ2UsXHJcbiAgICAgIHdlaWdodHM6IHBhcmFtLnNldCA/IGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzJykgOiBwYXJhbS53ZWlnaHRzLFxyXG4gICAgICBkaXN0YW5jZXM6IHBhcmFtLnNldCA/IGVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdEaXN0YW5jZXMnKSA6IHBhcmFtLmRpc3RhbmNlcyxcclxuICAgICAgc2V0OiB0cnVlLy9BcyB0aGUgcmVzdWx0IHdpbGwgbm90IGJlIHVzZWQgZm9yIHRoZSBmaXJzdCBmdW5jdGlvbiBjYWxsIHBhcmFtcyBzaG91bGQgYmUgdXNlZCB0byBzZXQgdGhlIGRhdGFcclxuICAgIH07XHJcblxyXG4gICAgdmFyIGhhc0JlbmQgPSBwYXJhbS53ZWlnaHRzICYmIHBhcmFtLndlaWdodHMubGVuZ3RoID4gMDtcclxuXHJcbiAgICAvL0NoZWNrIGlmIHdlIG5lZWQgdG8gc2V0IHRoZSB3ZWlnaHRzIGFuZCBkaXN0YW5jZXMgYnkgdGhlIHBhcmFtIHZhbHVlc1xyXG4gICAgaWYgKHBhcmFtLnNldCkge1xyXG4gICAgICBoYXNCZW5kID8gZWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ1dlaWdodHMnLCBwYXJhbS53ZWlnaHRzKSA6IGVkZ2UucmVtb3ZlRGF0YSgnY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzJyk7XHJcbiAgICAgIGhhc0JlbmQgPyBlZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nRGlzdGFuY2VzJywgcGFyYW0uZGlzdGFuY2VzKSA6IGVkZ2UucmVtb3ZlRGF0YSgnY3llZGdlYmVuZGVkaXRpbmdEaXN0YW5jZXMnKTtcclxuXHJcbiAgICAgIC8vcmVmcmVzaCB0aGUgY3VydmUgc3R5bGUgYXMgdGhlIG51bWJlciBvZiBiZW5kIHBvaW50IHdvdWxkIGJlIGNoYW5nZWQgYnkgdGhlIHByZXZpb3VzIG9wZXJhdGlvblxyXG4gICAgICBpZiAoaGFzQmVuZCkge1xyXG4gICAgICAgIGVkZ2UuYWRkQ2xhc3MoJ2VkZ2ViZW5kZWRpdGluZy1oYXNiZW5kcG9pbnRzJyk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgZWRnZS5yZW1vdmVDbGFzcygnZWRnZWJlbmRlZGl0aW5nLWhhc2JlbmRwb2ludHMnKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBlZGdlLnRyaWdnZXIoJ2N5ZWRnZWJlbmRlZGl0aW5nLmNoYW5nZUJlbmRQb2ludHMnKTtcclxuXHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG4gIH1cclxuXHJcbiAgdXIuYWN0aW9uKCdjaGFuZ2VCZW5kUG9pbnRzJywgY2hhbmdlQmVuZFBvaW50cywgY2hhbmdlQmVuZFBvaW50cyk7XHJcbn07XHJcbiJdfQ==
