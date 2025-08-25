import React, { useState, useRef, useEffect } from 'react';
import Delaunator from 'delaunator';
import { Stage, Layer, Image as KonvaImage, Line, Group } from 'react-konva';
import logo from './logo.svg';
import './App.css';

function App() {
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
  const [randomPoints, setRandomPoints] = useState([]);
  const [triangles, setTriangles] = useState([]);
  const [konvaImg, setKonvaImg] = useState(null);
  const [piecePositions, setPiecePositions] = useState([]); // [{x, y}]
  const [shardImages, setShardImages] = useState([]); // Array of {img: Image, bbox: {minX, minY}}
  const [correctPositions, setCorrectPositions] = useState([]); // [{x, y}] for each piece
  const [locked, setLocked] = useState([]); // [bool] for each piece
  const [neighbors, setNeighbors] = useState([]); // Array of arrays: neighbors[i] = [neighbor indices]
  const [groupIds, setGroupIds] = useState([]); // groupIds[i] = group id for piece i
  const [justSnappedGroup, setJustSnappedGroup] = useState(null); // groupId of last snapped group
  const [justSnappedScale, setJustSnappedScale] = useState(1); // scale for snap pop
  const [completed, setCompleted] = useState(false);
  const canvasRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setImage(null);
      setPreviewUrl(null);
      setImgDimensions({ width: 0, height: 0 });
      setRandomPoints([]);
      setTriangles([]);
      setKonvaImg(null);
      setPiecePositions([]);
      setCorrectPositions([]);
      setLocked([]);
      setNeighbors([]);
      setGroupIds([]);
    }
  };

  // When previewUrl changes, load image into canvas and get dimensions
  useEffect(() => {
    if (!previewUrl) return;
    const img = new window.Image();
    img.onload = () => {
      setImgDimensions({ width: img.width, height: img.height });
      // Draw to hidden canvas
      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);
      // Generate random points
      const numPoints = 3;
      const points = [];
      for (let i = 0; i < numPoints; i++) {
        const x = Math.random() * img.width;
        const y = Math.random() * img.height;
        points.push([x, y]);
      }
      // Add corners to ensure full coverage
      points.push([0, 0], [img.width, 0], [img.width, img.height], [0, img.height]);
      setRandomPoints(points);
    };
    img.src = previewUrl;
    setKonvaImg(null);
    // For Konva rendering
    const konvaImgObj = new window.Image();
    konvaImgObj.onload = () => setKonvaImg(konvaImgObj);
    konvaImgObj.src = previewUrl;
  }, [previewUrl]);

  // When randomPoints change, triangulate them
  useEffect(() => {
    if (!randomPoints || randomPoints.length < 3) {
      setTriangles([]);
      setPiecePositions([]);
      setCorrectPositions([]);
      setLocked([]);
      setNeighbors([]);
      setGroupIds([]);
      return;
    }
    const delaunay = Delaunator.from(randomPoints);
    const { triangles: triIndices } = delaunay;
    const tris = [];
    for (let i = 0; i < triIndices.length; i += 3) {
      tris.push([
        randomPoints[triIndices[i]],
        randomPoints[triIndices[i + 1]],
        randomPoints[triIndices[i + 2]],
      ]);
    }
    setTriangles(tris);
    // Scatter pieces randomly around the canvas (scatter is relative to triangle's original position)
    const scatterMargin = 60;
    const positions = tris.map(() => {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * scatterMargin + scatterMargin;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
    setPiecePositions(positions);
    // Store correct positions (should be at (0,0) relative to their bbox)
    setCorrectPositions(tris.map(() => ({ x: 0, y: 0 })));
    setLocked(tris.map(() => false));

    // --- Neighbor detection ---
    // Helper: get edges for a triangle (as sorted point pairs)
    const getEdges = (triangle) => [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ].map(edge => edge.map(([x, y]) => `${x},${y}`));

    // Build a map from edge string to triangle indices
    const edgeMap = new Map();
    tris.forEach((triangle, idx) => {
      getEdges(triangle).forEach(edge => {
        const key = edge.slice().sort().join('|'); // undirected edge
        if (!edgeMap.has(key)) edgeMap.set(key, []);
        edgeMap.get(key).push(idx);
      });
    });
    // For each triangle, find neighbors (triangles sharing an edge)
    const neighborsArr = tris.map((triangle, idx) => {
      const neighborSet = new Set();
      getEdges(triangle).forEach(edge => {
        const key = edge.slice().sort().join('|');
        const triList = edgeMap.get(key) || [];
        triList.forEach(otherIdx => {
          if (otherIdx !== idx) neighborSet.add(otherIdx);
        });
      });
      return Array.from(neighborSet);
    });
    setNeighbors(neighborsArr);
    // --- End neighbor detection ---
    // Initialize groupIds: each piece starts in its own group
    setGroupIds(tris.map((_, idx) => idx));
    console.log('Triangles:', tris);
    console.log('Neighbors:', neighborsArr);
  }, [randomPoints]);

  // Check for completion after every groupIds change
  useEffect(() => {
    if (groupIds.length > 0 && new Set(groupIds).size === 1) {
      setCompleted(true);
    } else {
      setCompleted(false);
    }
  }, [groupIds]);

  // Helper: get bounding box for a triangle
  const getTriangleBBox = (triangle) => {
    const xs = triangle.map(([x]) => x);
    const ys = triangle.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY };
  };

  // Generate shard images after triangles and konvaImg are ready
  useEffect(() => {
    if (!konvaImg || triangles.length === 0) {
      setShardImages([]);
      return;
    }
    const newShardImages = triangles.map((triangle) => {
      const bbox = getTriangleBBox(triangle);
      const width = bbox.maxX - bbox.minX;
      const height = bbox.maxY - bbox.minY;
      // Create offscreen canvas
      const offCanvas = document.createElement('canvas');
      offCanvas.width = Math.ceil(width);
      offCanvas.height = Math.ceil(height);
      const ctx = offCanvas.getContext('2d');
      // Draw triangle path
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(triangle[0][0] - bbox.minX, triangle[0][1] - bbox.minY);
      ctx.lineTo(triangle[1][0] - bbox.minX, triangle[1][1] - bbox.minY);
      ctx.lineTo(triangle[2][0] - bbox.minX, triangle[2][1] - bbox.minY);
      ctx.closePath();
      ctx.clip();
      // Draw the image, offset so the triangle is in the right place
      ctx.drawImage(konvaImg, -bbox.minX, -bbox.minY);
      ctx.restore();
      // Create image object
      const img = new window.Image();
      img.src = offCanvas.toDataURL();
      return { img, bbox };
    });
    setShardImages(newShardImages);
  }, [konvaImg, triangles]);

  // Calculate scale for fitting puzzle to viewport
  let scale = 1;
  let stageWidth = imgDimensions.width;
  let stageHeight = imgDimensions.height;
  if (imgDimensions.width && imgDimensions.height) {
    const maxW = window.innerWidth * 0.9;
    const maxH = window.innerHeight * 0.8;
    scale = Math.min(
      maxW / imgDimensions.width,
      maxH / imgDimensions.height,
      1
    );
    stageWidth = imgDimensions.width * scale;
    stageHeight = imgDimensions.height * scale;
  }

  // Shuffle/Reset handler
  const handleShuffle = () => {
    const scatterMargin = 60;
    setPiecePositions(piecePositions.map(() => {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * scatterMargin + scatterMargin;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    }));
    setLocked(locked.map(() => false));
  };

  // Snap threshold in pixels
  const SNAP_THRESHOLD = 20;
  const SNAP_EDGE_THRESHOLD = 50; // px, for edge snapping

  // Helper: get edges for a triangle (returns array of [pointA, pointB])
  const getTriangleEdges = (triangle) => [
    [triangle[0], triangle[1]],
    [triangle[1], triangle[2]],
    [triangle[2], triangle[0]],
  ];

  // Helper: check if two points are close
  const pointsClose = (a, b, threshold = SNAP_EDGE_THRESHOLD) => {
    return Math.hypot(a[0] - b[0], a[1] - b[1]) < threshold;
  };

  // Helper: check if two edges match (regardless of order)
  const edgesMatch = (e1, e2, threshold = SNAP_EDGE_THRESHOLD) => {
    // e1: [A, B], e2: [C, D]
    return (
      (pointsClose(e1[0], e2[0], threshold) && pointsClose(e1[1], e2[1], threshold)) ||
      (pointsClose(e1[0], e2[1], threshold) && pointsClose(e1[1], e2[0], threshold))
    );
  };

  // Remove preview image rendering and adjust puzzle area
  return (
    <div className="App" style={{ minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', background: '#f0f0f0', overflow: 'hidden' }}>
      <h1 style={{ fontSize: '3rem', margin: '2rem 0 1.5rem 0', letterSpacing: '2px' }}>&lt;Game Title&gt;</h1>
      <section style={{ background: '#fff', padding: '2rem 3rem', borderRadius: '1rem', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginTop: '1rem' }}>
        <label htmlFor="image-upload" style={{ fontSize: '1.2rem', fontWeight: 'bold', display: 'block', marginBottom: '1rem' }}>
          Upload a picture to start:
        </label>
        <input
          id="image-upload"
          type="file"
          accept="image/*"
          style={{ fontSize: '1rem' }}
          onChange={handleImageChange}
        />
        {/* No preview image here */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </section>
      {/* Konva draggable puzzle visualization */}
      {shardImages.length === triangles.length && piecePositions.length === triangles.length && (
        <div style={{
          marginTop: '2rem',
          background: '#fff',
          borderRadius: '1rem',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          padding: 0,
          width: stageWidth,
          height: stageHeight,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <button onClick={handleShuffle} style={{ position: 'absolute', zIndex: 2, top: 16, left: 16, padding: '0.5rem 1.5rem', fontSize: '1.1rem', borderRadius: '0.5rem', border: 'none', background: '#0099cc', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>
            Shuffle / Reset
          </button>
          {/* Completion message overlay */}
          {completed && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(0,0,0,0.55)',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}>
              <div style={{
                background: '#fff',
                padding: '2rem 3rem',
                borderRadius: '1rem',
                boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
                fontSize: '2.2rem',
                fontWeight: 'bold',
                color: '#0099cc',
                textAlign: 'center',
              }}>
                Memory Recovered
              </div>
            </div>
          )}
          <Stage
            width={stageWidth}
            height={stageHeight}
            scale={{ x: scale, y: scale }}
            style={{ borderRadius: '1rem', background: '#222', width: stageWidth, height: stageHeight, position: 'absolute', left: 0, top: 0 }}
          >
            <Layer>
              {/* Render each group of pieces */}
              {groupIds.length > 0 &&
                Array.from(new Set(groupIds)).map(groupId => {
                  // Find all piece indices in this group
                  const groupPieceIndices = groupIds.map((gid, idx) => gid === groupId ? idx : -1).filter(idx => idx !== -1);
                  // Use the first piece in the group as the drag handle
                  const firstIdx = groupPieceIndices[0];
                  // Calculate group offset (use the first piece's position)
                  const groupOffset = piecePositions[firstIdx];
                  return (
                    <Group
                      key={groupId}
                      draggable
                      x={0}
                      y={0}
                      onDragMove={e => {
                        // Move all pieces in the group by the drag delta
                        const dragDelta = {
                          x: e.target.x() - (groupOffset?.x || 0),
                          y: e.target.y() - (groupOffset?.y || 0),
                        };
                        const newPositions = [...piecePositions];
                        groupPieceIndices.forEach(idx => {
                          newPositions[idx] = {
                            x: piecePositions[idx].x + dragDelta.x,
                            y: piecePositions[idx].y + dragDelta.y,
                          };
                        });
                        setPiecePositions(newPositions);
                      }}
                      onDragEnd={e => {
                        // Edge-matching and snapping logic (unchanged)
                        let snapped = false;
                        let snapDelta = { x: 0, y: 0 };
                        let mergeWithGroupId = null;
                        let mergeIndices = [];
                        for (const idx of groupPieceIndices) {
                          const tri = triangles[idx];
                          const triEdges = getTriangleEdges(tri);
                          const triPos = piecePositions[idx];
                          for (let edgeIdx = 0; edgeIdx < triEdges.length; edgeIdx++) {
                            const edge = triEdges[edgeIdx];
                            const edgeA = [edge[0][0] + triPos.x, edge[0][1] + triPos.y];
                            const edgeB = [edge[1][0] + triPos.x, edge[1][1] + triPos.y];
                            for (const neighborIdx of neighbors[idx] || []) {
                              if (groupIds[neighborIdx] === groupId) continue;
                              const neighborTri = triangles[neighborIdx];
                              const neighborEdges = getTriangleEdges(neighborTri);
                              const neighborPos = piecePositions[neighborIdx];
                              for (let nEdgeIdx = 0; nEdgeIdx < neighborEdges.length; nEdgeIdx++) {
                                const nEdge = neighborEdges[nEdgeIdx];
                                const nEdgeA = [nEdge[0][0] + neighborPos.x, nEdge[0][1] + neighborPos.y];
                                const nEdgeB = [nEdge[1][0] + neighborPos.x, nEdge[1][1] + neighborPos.y];
                                if (edgesMatch([edgeA, edgeB], [nEdgeA, nEdgeB])) {
                                  let deltaA = [nEdgeA[0] - edgeA[0], nEdgeA[1] - edgeA[1]];
                                  let deltaB = [nEdgeB[0] - edgeB[0], nEdgeB[1] - edgeB[1]];
                                  let distA = Math.hypot(deltaA[0], deltaA[1]) + Math.hypot(deltaB[0], deltaB[1]);
                                  let deltaA2 = [nEdgeB[0] - edgeA[0], nEdgeB[1] - edgeA[1]];
                                  let deltaB2 = [nEdgeA[0] - edgeB[0], nEdgeA[1] - edgeB[1]];
                                  let distB = Math.hypot(deltaA2[0], deltaA2[1]) + Math.hypot(deltaB2[0], deltaB2[1]);
                                  let finalDelta;
                                  if (distA < distB) {
                                    finalDelta = deltaA;
                                  } else {
                                    finalDelta = deltaA2;
                                  }
                                  snapDelta = { x: finalDelta[0], y: finalDelta[1] };
                                  mergeWithGroupId = groupIds[neighborIdx];
                                  mergeIndices = groupIds.map((gid, i) => gid === mergeWithGroupId ? i : -1).filter(i => i !== -1);
                                  snapped = true;
                                  break;
                                }
                              }
                              if (snapped) break;
                            }
                            if (snapped) break;
                          }
                          if (snapped) break;
                        }
                        if (snapped && mergeWithGroupId !== null) {
                          const newPositions = [...piecePositions];
                          groupPieceIndices.forEach(idx => {
                            newPositions[idx] = {
                              x: piecePositions[idx].x + snapDelta.x,
                              y: piecePositions[idx].y + snapDelta.y,
                            };
                          });
                          setPiecePositions(newPositions);
                          const newGroupIds = [...groupIds];
                          groupPieceIndices.forEach(idx => {
                            newGroupIds[idx] = mergeWithGroupId;
                          });
                          setGroupIds(newGroupIds);
                          // Visual feedback: highlight the merged group
                          setJustSnappedGroup(mergeWithGroupId);
                          setJustSnappedScale(1.15);
                          setTimeout(() => setJustSnappedGroup(null), 800);
                          setTimeout(() => setJustSnappedScale(1), 800);
                        }
                      }}
                    >
                      {groupPieceIndices.map(idx => {
                        const { img, bbox } = shardImages[idx];
                        const groupX = bbox.minX + piecePositions[idx].x;
                        const groupY = bbox.minY + piecePositions[idx].y;
                        return (
                          <KonvaImage
                            key={idx}
                            image={img}
                            width={bbox.maxX - bbox.minX}
                            height={bbox.maxY - bbox.minY}
                            x={groupX}
                            y={groupY}
                            shadowForStrokeEnabled={false}
                            shadowEnabled={justSnappedGroup === groupId}
                            shadowColor={justSnappedGroup === groupId ? '#ffeb3b' : undefined}
                            shadowBlur={justSnappedGroup === groupId ? 50 : 0}
                            shadowOpacity={justSnappedGroup === groupId ? 1 : 0}
                            stroke={justSnappedGroup === groupId ? '#ffeb3b' : undefined}
                            strokeWidth={justSnappedGroup === groupId ? 10 : 0}
                          />
                        );
                      })}
                    </Group>
                  );
                })}
            </Layer>
          </Stage>
        </div>
      )}
    </div>
  );
}

export default App;
