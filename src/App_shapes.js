import React, { useState, useRef, useEffect } from 'react';
import Delaunator from 'delaunator';
import { Stage, Layer, Image as KonvaImage, Group, Line } from 'react-konva';

import './App.css';
import AHDLogo from './AHD_logo.png';

// Insert your AILabTools API key here
const AILAB_API_KEY = "IBycRKAm4LCdOca49rTeWfQ0NUxPs3QRm1Z56duphXtDtiMNGYiVTg1ZSwzSaH8p";
// Toggle this to false to disable the API call and use the original image for the modal
const USE_AILAB_API = false;

function App() {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
  const [triangles, setTriangles] = useState([]);
  const [konvaImg, setKonvaImg] = useState(null);
  const [piecePositions, setPiecePositions] = useState([]);
  const [shardImages, setShardImages] = useState([]);
  const [neighbors, setNeighbors] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [justSnappedShard, setJustSnappedShard] = useState(null);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [sadImageUrl, setSadImageUrl] = useState(null);
  const [isProcessingEmotion, setIsProcessingEmotion] = useState(false);
  const canvasRef = useRef(null);
  const layerRef = useRef();
  const [difficulty, setDifficulty] = useState('Easy'); // Easy, Medium, Hard
  const difficultyPoints = { Easy: 2, Medium: 4, Hard: 8 };
  const [puzzleShape, setPuzzleShape] = useState('broken-glass'); // broken-glass, classic-jigsaw
  const [puzzlePieces, setPuzzlePieces] = useState([]);
  const [puzzleBoard, setPuzzleBoard] = useState([]);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [puzzleSize, setPuzzleSize] = useState(3); // 3x3, 4x4, 5x5
  const [boardDimensions, setBoardDimensions] = useState({ width: 0, height: 0 });

  // Helper: Convert dataURL to Blob
  function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  // Handle image upload
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsProcessingEmotion(true);
      setSadImageUrl(null);
      setShowMemoryModal(false);
      // Read file as dataURL for preview
      const reader = new FileReader();
      reader.onloadend = async () => {
        setPreviewUrl(reader.result);
        if (USE_AILAB_API) {
          // Send to AILabTools API for sad emotion
          try {
            const formData = new FormData();
            // Use the original file for best quality
            formData.append('image_target', file);
            formData.append('service_choice', 15); // 15 = Sad
            const response = await fetch('https://www.ailabapi.com/api/portrait/effects/emotion-editor', {
              method: 'POST',
              headers: {
                'ailabapi-api-key': AILAB_API_KEY,
              },
              body: formData,
            });
            const result = await response.json();
            if (result && result.data && result.data.image) {
              setSadImageUrl('data:image/png;base64,' + result.data.image);
              setShowMemoryModal(true);
            } else {
              alert('Failed to process image for emotion.');
            }
          } catch (err) {
            alert('Error contacting AILabTools API.');
          } finally {
            setIsProcessingEmotion(false);
          }
        } else {
          // Development mode: just use the original image for the modal
          setSadImageUrl(reader.result);
          setShowMemoryModal(true);
          setIsProcessingEmotion(false);
        }
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
      setImgDimensions({ width: 0, height: 0 });
      setTriangles([]);
      setKonvaImg(null);
      setPiecePositions([]);
      setNeighbors([]);
      setGroupIds([]);
    }
  };



  // Generate triangles for broken glass effect
  const generateTriangles = (imgWidth, imgHeight, numPoints, margin) => {
    const points = [];
    for (let i = 0; i < numPoints; i++) {
      const x = Math.random() * (imgWidth - 2 * margin) + margin;
      const y = Math.random() * (imgHeight - 2 * margin) + margin;
      points.push([x, y]);
    }
    // Add corners
    points.push([0, 0], [imgWidth, 0], [imgWidth, imgHeight], [0, imgHeight]);
    // Triangulate
    const delaunay = Delaunator.from(points);
    const { triangles: triIndices } = delaunay;
    const tris = [];
    for (let i = 0; i < triIndices.length; i += 3) {
      tris.push([
        points[triIndices[i]],
        points[triIndices[i + 1]],
        points[triIndices[i + 2]],
      ]);
    }
    return tris;
  };

    // Generate puzzle pieces for classic jigsaw
  const generatePuzzlePieces = (imageSrc, size) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const pieces = [];
        
        // Use the original image dimensions without cropping
        const imgWidth = img.width;
        const imgHeight = img.height;
        
        // Scale the image to fit within the play area while maintaining aspect ratio
        const maxBoardWidth = 500;
        const maxBoardHeight = 500;
        
        let boardWidth, boardHeight;
        if (imgWidth > imgHeight) {
          // Landscape image
          boardWidth = maxBoardWidth;
          boardHeight = (maxBoardWidth * imgHeight) / imgWidth;
        } else {
          // Portrait or square image
          boardHeight = maxBoardHeight;
          boardWidth = (maxBoardHeight * imgWidth) / imgHeight;
        }
        
        const pieceWidth = boardWidth / size;
        const pieceHeight = boardHeight / size;
        
        // Calculate play area dimensions
        const playAreaWidth = PLAY_AREA_WIDTH - 40;
        const playAreaHeight = PLAY_AREA_HEIGHT - 40;
        
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            const id = row * size + col;
            const correctX = col * pieceWidth;
            const correctY = row * pieceHeight;
            
            // Random position within play area bounds (avoiding the center board area)
            const boardX = (PLAY_AREA_WIDTH - boardWidth) / 2;
            const boardY = (PLAY_AREA_HEIGHT - boardHeight) / 2;
            
            let randomX, randomY;
            do {
              randomX = Math.random() * (playAreaWidth - pieceWidth);
              randomY = Math.random() * (playAreaHeight - pieceHeight);
            } while (
              randomX >= boardX - 50 && 
              randomX <= boardX + boardWidth + 50 &&
              randomY >= boardY - 50 && 
              randomY <= boardY + boardHeight + 50
            );
            
            pieces.push({
              id,
              row,
              col,
              x: randomX,
              y: randomY,
              correctX,
              correctY,
              width: pieceWidth,
              height: pieceHeight,
              boardWidth,
              boardHeight,
              originalWidth: imgWidth,
              originalHeight: imgHeight,
              isPlaced: false
            });
          }
        }
        
        resolve(pieces);
      };
      img.src = imageSrc;
    });
  };

  // Handle piece drag start
  const handleDragStart = (e, piece) => {
    setDraggedPiece(piece);
  };

  // Handle piece drag
  const handleDrag = (e, piece) => {
    const newX = e.target.x();
    const newY = e.target.y();
    
    const updatedPieces = puzzlePieces.map(p => 
      p.id === piece.id 
        ? { ...p, x: newX, y: newY }
        : p
    );
    setPuzzlePieces(updatedPieces);
  };

  // Handle piece drop
  const handleDrop = (e, piece) => {
    const dragDelta = {
      x: e.target.x(),
      y: e.target.y(),
    };
    
    // Reset the Konva group position
    e.target.x(0);
    e.target.y(0);
    
    // Update piece position like broken glass implementation
    const newPositions = [...puzzlePieces];
    const pieceIndex = newPositions.findIndex(p => p.id === piece.id);
    if (pieceIndex !== -1) {
      newPositions[pieceIndex] = {
        ...newPositions[pieceIndex],
        x: newPositions[pieceIndex].x + dragDelta.x,
        y: newPositions[pieceIndex].y + dragDelta.y,
      };
    }
    setPuzzlePieces(newPositions);
    
    // Calculate board position (centered) - match the visual frame position
    const boardX = (PLAY_AREA_WIDTH - boardDimensions.width) / 2;
    const boardY = (PLAY_AREA_HEIGHT - boardDimensions.height) / 2;
    
    // Check if piece is in correct position on the board
    const boardRelativeX = newPositions[pieceIndex].x - boardX;
    const boardRelativeY = newPositions[pieceIndex].y - boardY;
    const snapTolerance = 40; // Increased tolerance for easier snapping
    
    const isCorrectPosition = 
      Math.abs(boardRelativeX - piece.correctX) < snapTolerance &&
      Math.abs(boardRelativeY - piece.correctY) < snapTolerance;
    
    if (isCorrectPosition) {
      console.log('Piece snapped to correct position!', piece.id);
      // Snap to correct position on the board
      const snappedPieces = newPositions.map(p => 
        p.id === piece.id 
          ? { 
              ...p, 
              x: boardX + piece.correctX, 
              y: boardY + piece.correctY, 
              isPlaced: true 
            }
          : p
      );
      setPuzzlePieces(snappedPieces);
      
      // Check if puzzle is complete
      const allPlaced = snappedPieces.every(p => p.isPlaced);
      console.log('Pieces placed:', snappedPieces.filter(p => p.isPlaced).length, 'of', snappedPieces.length);
      if (allPlaced) {
        setCompleted(true);
      }
    }
    // If not in correct position, piece stays where it was dropped (no reset)
  };

  // Initialize puzzle when image is loaded
  useEffect(() => {
    if (previewUrl && puzzleShape === 'classic-jigsaw') {
      const size = difficulty === 'Easy' ? 3 : difficulty === 'Medium' ? 4 : 5;
      setPuzzleSize(size);
      
      generatePuzzlePieces(previewUrl, size).then(pieces => {
        setPuzzlePieces(pieces);
        if (pieces.length > 0) {
          setBoardDimensions({
            width: pieces[0].boardWidth,
            height: pieces[0].boardHeight
          });
        }
        setCompleted(false);
      });
    }
  }, [previewUrl, puzzleShape, difficulty]);

  // Shuffle puzzle pieces
  const shufflePuzzlePieces = () => {
    const playAreaWidth = PLAY_AREA_WIDTH;
    const playAreaHeight = PLAY_AREA_HEIGHT;
    
    // Use same positioning logic as handleDrop
    const boardX = (PLAY_AREA_WIDTH - boardDimensions.width) / 2;
    const boardY = (PLAY_AREA_HEIGHT - boardDimensions.height) / 2;
    
    const updatedPieces = puzzlePieces.map(piece => {
      // Only shuffle pieces that are not placed
      if (piece.isPlaced) {
        return piece; // Keep placed pieces in their current position
      }
      
      let randomX, randomY;
      do {
        randomX = Math.random() * (playAreaWidth - piece.width);
        randomY = Math.random() * (playAreaHeight - piece.height);
      } while (
        randomX >= boardX - 50 && 
        randomX <= boardX + boardDimensions.width + 50 &&
        randomY >= boardY - 50 && 
        randomY <= boardY + boardDimensions.height + 50
      );
      
      return {
        ...piece,
        x: randomX,
        y: randomY,
        isPlaced: false
      };
    });
    setPuzzlePieces(updatedPieces);
    setCompleted(false);
  };

  // When previewUrl changes, load image and generate shapes
  useEffect(() => {
    if (!previewUrl) return;
    const img = new window.Image();
    img.onload = () => {
      setImgDimensions({ width: img.width, height: img.height });
      // Generate triangles for broken glass effect
      const numPoints = difficultyPoints[difficulty] || 2;
      const margin = 0.15 * img.width;
      const shapes = generateTriangles(img.width, img.height, numPoints, margin);
      setTriangles(shapes);
      setGroupIds(shapes.map((_, idx) => idx));
      setNeighbors(() => {
        // Find neighbors by shared edge
        const getEdges = (shape) => {
          if (shape.length === 3) {
            // Triangle
            return [
              [shape[0], shape[1]],
              [shape[1], shape[2]],
              [shape[2], shape[0]],
            ].map(edge => edge.map(([x, y]) => `${x},${y}`));
          } else {
            // Square, rectangle, or octagon
            const edges = [];
            for (let i = 0; i < shape.length; i++) {
              const next = (i + 1) % shape.length;
              edges.push([shape[i], shape[next]]);
            }
            return edges.map(edge => edge.map(([x, y]) => `${x},${y}`));
          }
        };
        const edgeMap = new Map();
        shapes.forEach((shape, idx) => {
          getEdges(shape).forEach(edge => {
            const key = edge.slice().sort().join('|');
            if (!edgeMap.has(key)) edgeMap.set(key, []);
            edgeMap.get(key).push(idx);
          });
        });
        return shapes.map((shape, idx) => {
          const neighborSet = new Set();
          getEdges(shape).forEach(edge => {
            const key = edge.slice().sort().join('|');
            const shapeList = edgeMap.get(key) || [];
            shapeList.forEach(otherIdx => {
              if (otherIdx !== idx) neighborSet.add(otherIdx);
            });
          });
          return Array.from(neighborSet);
        });
      });
    };
    img.src = previewUrl;
    setKonvaImg(null);
    const konvaImgObj = new window.Image();
    konvaImgObj.onload = () => setKonvaImg(konvaImgObj);
    konvaImgObj.src = previewUrl;
  }, [previewUrl, difficulty]);

  // Generate shard images
  useEffect(() => {
    if (!konvaImg || triangles.length === 0) {
      setShardImages([]);
      return;
    }
    setShardImages(triangles.map((shape) => {
      const bbox = getShapeBBox(shape);
      const width = bbox.maxX - bbox.minX;
      const height = bbox.maxY - bbox.minY;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = Math.ceil(width);
      offCanvas.height = Math.ceil(height);
      const ctx = offCanvas.getContext('2d');
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(shape[0][0] - bbox.minX, shape[0][1] - bbox.minY);
      for (let i = 1; i < shape.length; i++) {
        ctx.lineTo(shape[i][0] - bbox.minX, shape[i][1] - bbox.minY);
      }
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(konvaImg, -bbox.minX, -bbox.minY);
      ctx.restore();
      const img = new window.Image();
      img.src = offCanvas.toDataURL();
      return { img, bbox };
    }));
  }, [konvaImg, triangles]);

  // Get bounding box for any shape
  const getShapeBBox = (shape) => {
    const xs = shape.map(([x]) => x);
    const ys = shape.map(([, y]) => y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  };

  // Puzzle scale
  const STAGE_WIDTH = window.innerWidth;
  const STAGE_HEIGHT = window.innerHeight;
  let puzzleScale = 1;
  if (imgDimensions.width && imgDimensions.height) {
    const maxPuzzleW = STAGE_WIDTH * 0.6;
    const maxPuzzleH = STAGE_HEIGHT * 0.6;
    puzzleScale = Math.min(
      maxPuzzleW / imgDimensions.width,
      maxPuzzleH / imgDimensions.height,
      1
    );
  }

  // Scatter pieces randomly
  const PLAY_AREA_HEIGHT = window.innerHeight * 0.9;
  const PLAY_AREA_WIDTH = window.innerWidth * 0.9;
  const scatterPieces = React.useCallback(() => {
    return triangles.map((_, idx) => {
      const bbox = shardImages[idx]?.bbox || { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      // const pieceWidth = (bbox.maxX - bbox.minX) * puzzleScale;
      // const pieceHeight = (bbox.maxY - bbox.minY) * puzzleScale;
      // Calculate allowed range for x and y so the piece is fully inside
      const minX = -bbox.minX * puzzleScale;
      const maxX = PLAY_AREA_WIDTH - (bbox.maxX * puzzleScale);
      const minY = -bbox.minY * puzzleScale;
      const maxY = PLAY_AREA_HEIGHT - (bbox.maxY * puzzleScale);
      const x = Math.random() * Math.max(1, maxX - minX) + minX;
      const y = Math.random() * Math.max(1, maxY - minY) + minY;
      return { x, y };
    });
  }, [triangles, shardImages, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT, puzzleScale]);

  useEffect(() => {
    if (triangles.length > 0 && shardImages.length === triangles.length) {
      setPiecePositions(scatterPieces());
    }
  }, [triangles, shardImages, scatterPieces]);

  // Snap logic
  const SNAP_EDGE_THRESHOLD = 75;
  const getShapeEdges = (shape) => {
    if (shape.length === 3) {
      // Triangle
      return [
        [shape[0], shape[1]],
        [shape[1], shape[2]],
        [shape[2], shape[0]],
      ];
    } else {
      // Square, rectangle, or octagon
      const edges = [];
      for (let i = 0; i < shape.length; i++) {
        const next = (i + 1) % shape.length;
        edges.push([shape[i], shape[next]]);
      }
      return edges;
    }
  };
  const pointsClose = (a, b, threshold = SNAP_EDGE_THRESHOLD) => {
    return Math.hypot(a[0] - b[0], a[1] - b[1]) < threshold;
  };
  const edgesMatch = (e1, e2, threshold = SNAP_EDGE_THRESHOLD) => {
    return (
      (pointsClose(e1[0], e2[0], threshold) && pointsClose(e1[1], e2[1], threshold)) ||
      (pointsClose(e1[0], e2[1], threshold) && pointsClose(e1[1], e2[0], threshold))
    );
  };

  // Completion check
  useEffect(() => {
    if (groupIds.length > 0 && new Set(groupIds).size === 1) {
      setCompleted(true);
    } else {
      setCompleted(false);
    }
  }, [groupIds]);

  // Reset
  const handleShuffle = () => {
    setPiecePositions(scatterPieces());
    setGroupIds(triangles.map((_, idx) => idx));
  };

  // UI
  const showPuzzleUI = !!previewUrl;
  const showPlayArea = showPuzzleUI && (
    puzzleShape === 'classic-jigsaw' || 
    (triangles.length > 0 && piecePositions.length === triangles.length && shardImages.length === triangles.length)
  );

  useEffect(() => {
    if (justSnappedShard && layerRef.current) {
      layerRef.current.batchDraw();
      const timeout = setTimeout(() => setJustSnappedShard(null), 300);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [justSnappedShard]);

  return (
    <div className="App" style={{ minHeight: '100vh', width: '100vw', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', position: 'relative' }}>
      <div className="background-overlay" />
      {/* Memory Extracted Modal */}
      {showMemoryModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.45)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '1.2rem',
            boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
            padding: '2rem 2.5rem', // Symmetric vertical padding
            maxWidth: 420,
            width: '90vw',
            textAlign: 'center',
            position: 'relative',
          }}>
            <h2 style={{ fontSize: '2.2rem', margin: 0, marginBottom: '1.5rem', color: '#222' }}>Memory Extracted</h2>
            {/* Optionally add a description here if you want */}
            {sadImageUrl && (
              <img
                src={sadImageUrl}
                alt="Sad Memory"
                style={{
                  width: '100%',
                  maxWidth: 520, // Increased from 320
                  maxHeight: 520, // Increased from 320
                  objectFit: 'contain',
                  borderRadius: '0.7rem',
                  marginBottom: '1.5rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                }}
              />
            )}
            <button
              onClick={() => setShowMemoryModal(false)}
              style={{
                marginTop: '0.5rem',
                padding: '0.7rem 2.2rem',
                fontSize: '1.15rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: '#0099cc',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
              }}
              disabled={isProcessingEmotion}
            >
              {isProcessingEmotion ? 'Processing...' : 'Press to Begin Reconstruction'}
            </button>
          </div>
        </div>
      )}
      {/* Top navigation bar with centered AHD Logo */}
      <nav style={{ width: '100vw', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="https://humandevelopment.doc.ic.ac.uk/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <img src={AHDLogo} alt="AHD Logo" style={{ height: 44, maxWidth: '90vw', objectFit: 'contain', display: 'block' }} />
        </a>
      </nav>
      <h1 style={{ fontSize: '3rem', margin: '2rem 0 1.5rem 0', letterSpacing: '2px' }}>
        Resurrecting the Self
      </h1>
      <div style={{ fontSize: '1.15rem', color: '#444', marginBottom: '2rem', marginTop: '1rem', textAlign: 'center' }}>
        Welcome to the Resurrecting the Self!
        <br /> To begin, please select a difficulty level, then upload
        <br /> a childhood photo of yourself where you are smiling.
      </div>
      <div style={{ fontSize: '1.08rem', color: '#333', marginBottom: '1.5rem', fontWeight: 500, textAlign: 'center' }}>
        Select Difficulty
      </div>
      {/* Difficulty Selection */}
      <div style={{ display: 'flex', gap: '1.2rem', marginBottom: '1.2rem', marginTop: '-0.5rem' }}>
        {['Easy', 'Medium', 'Hard'].map((level) => (
          <button
            key={level}
            onClick={() => setDifficulty(level)}
            style={{
              padding: '0.6rem 2.2rem',
              fontSize: '1.1rem',
              borderRadius: '0.5rem',
              border: difficulty === level ? '2.5px solid #0099cc' : '1.5px solid #bbb',
              background: difficulty === level ? '#e6f7ff' : '#fff',
              color: '#222',
              fontWeight: difficulty === level ? 'bold' : 'normal',
              cursor: 'pointer',
              boxShadow: difficulty === level ? '0 2px 8px rgba(0,153,204,0.10)' : '0 2px 8px rgba(0,0,0,0.04)',
              outline: 'none',
              transition: 'all 0.15s',
            }}
          >
            {level}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '1.08rem', color: '#333', marginBottom: '1.5rem', fontWeight: 500, textAlign: 'center' }}>
        Select Puzzle Shape
      </div>
      {/* Shape Selection */}
      <div style={{ display: 'flex', gap: '1.2rem', marginBottom: '1.2rem', marginTop: '-0.5rem', justifyContent: 'center' }}>
        {[
          { key: 'broken-glass', label: 'Broken Glass' },
          { key: 'classic-jigsaw', label: 'Classic Jigsaw' }
        ].map((shape) => (
          <button
            key={shape.key}
            onClick={() => setPuzzleShape(shape.key)}
            style={{
              padding: '0.6rem 2.2rem',
              fontSize: '1.1rem',
              borderRadius: '0.5rem',
              border: puzzleShape === shape.key ? '2.5px solid #0099cc' : '1.5px solid #bbb',
              background: puzzleShape === shape.key ? '#e6f7ff' : '#fff',
              color: '#222',
              fontWeight: puzzleShape === shape.key ? 'bold' : 'normal',
              cursor: 'pointer',
              boxShadow: puzzleShape === shape.key ? '0 2px 8px rgba(0,153,204,0.10)' : '0 2px 8px rgba(0,0,0,0.04)',
              outline: 'none',
              transition: 'all 0.15s',
            }}
          >
            {shape.label}
          </button>
        ))}
      </div>
      <section style={{ background: '#fff', padding: '2rem 3rem', borderRadius: '1rem', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginTop: '1rem', marginBottom: '2rem' }}>
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
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </section>
      {showPlayArea && !showMemoryModal && (
        <div
          style={{
            marginTop: '1rem',
            marginBottom: '0.5rem',
            background: '#fff5f0',
            borderRadius: '1rem',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            padding: 0,
            width: PLAY_AREA_WIDTH,
            height: PLAY_AREA_HEIGHT,
            maxWidth: PLAY_AREA_WIDTH,
            maxHeight: PLAY_AREA_HEIGHT,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
                              {puzzleShape === 'classic-jigsaw' ? (
            // Custom Classic Jigsaw Puzzle
            <div style={{ 
              width: '100%', 
              height: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              background: '#fff5f0',
              position: 'relative',
              borderRadius: '1rem'
            }}>
              {previewUrl ? (
                <>
                  {/* Shuffle button */}
                  <button
                    onClick={shufflePuzzlePieces}
                    style={{
                      position: 'absolute',
                      top: 16,
                      left: 16,
                      zIndex: 20,
                      padding: '0.5rem 1.2rem',
                      fontSize: '1.1rem',
                      borderRadius: '0.5rem',
                      border: 'none',
                      background: '#ff8c42',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                    }}
                  >
                    Shuffle
                  </button>

                  {/* Puzzle Board */}
                  <div 
                    style={{
                      width: boardDimensions.width,
                      height: boardDimensions.height,
                      border: '3px solid #333',
                      borderRadius: '8px',
                      background: '#fff',
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)', // Move frame higher by changing -50% to -60%
                      zIndex: 1
                    }}
                  >
                    {/* Grid lines for visual guidance */}
                    {Array.from({ length: puzzleSize - 1 }, (_, i) => (
                      <div key={`h-${i}`} style={{
                        position: 'absolute',
                        top: (i + 1) * (boardDimensions.height / puzzleSize),
                        left: 0,
                        width: '100%',
                        height: '1px',
                        background: '#ddd'
                      }} />
                    ))}
                    {Array.from({ length: puzzleSize - 1 }, (_, i) => (
                      <div key={`v-${i}`} style={{
                        position: 'absolute',
                        top: 0,
                        left: (i + 1) * (boardDimensions.width / puzzleSize),
                        width: '1px',
                        height: '100%',
                        background: '#ddd'
                      }} />
                    ))}
                  </div>

                  {/* Konva Stage for Puzzle Pieces */}
                  <Stage
                    width={PLAY_AREA_WIDTH}
                    height={PLAY_AREA_HEIGHT}
                    style={{ position: 'absolute', top: 0, left: 0, zIndex: 2 }}
                  >
                    <Layer>
                      {puzzlePieces.map((piece) => (
                        <Group
                          key={piece.id}
                          draggable={!piece.isPlaced} // Disable dragging for placed pieces
                          x={0}
                          y={0}
                          dragBoundFunc={(pos, evt) => pos}
                          onDragEnd={(e) => handleDrop(e, piece)}
                        >
                          <KonvaImage
                            image={konvaImg}
                            width={piece.width}
                            height={piece.height}
                            x={piece.x}
                            y={piece.y}
                            crop={{
                              x: (piece.correctX / piece.boardWidth) * piece.originalWidth,
                              y: (piece.correctY / piece.boardHeight) * piece.originalHeight,
                              width: (piece.width / piece.boardWidth) * piece.originalWidth,
                              height: (piece.height / piece.boardHeight) * piece.originalHeight
                            }}
                            stroke={piece.isPlaced ? '#4CAF50' : '#333'}
                            strokeWidth={2}
                            cornerRadius={4}
                            shadowEnabled={piece.isPlaced}
                            shadowColor={piece.isPlaced ? '#4CAF50' : undefined}
                            shadowBlur={piece.isPlaced ? 10 : 0}
                            shadowOpacity={piece.isPlaced ? 0.8 : 0}
                          />
                        </Group>
                      ))}
                    </Layer>
                  </Stage>

                  {/* Completion overlay - same as broken glass */}
                  {completed && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(255,255,255,0.5)',
                        backdropFilter: 'blur(6px)',
                        zIndex: 1,
                        pointerEvents: 'none',
                        borderRadius: '1rem',
                      }} />
                      <div style={{
                        position: 'relative',
                        zIndex: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                      }}>
                        <div style={{
                          fontSize: '2.7rem',
                          fontWeight: 'bold',
                          color: '#000000',
                          marginBottom: '1.2rem',
                        }}>
                          Memory Recovered!
                        </div>
                        <img
                          src={previewUrl}
                          alt="Completed"
                          style={{
                            width: '480px',
                            maxWidth: '70vw',
                            maxHeight: '60vh',
                            objectFit: 'contain',
                            borderRadius: '0.5rem',
                            marginTop: '1.0rem',
                            marginBottom: '1.0rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                          }}
                        />
                        <button 
                          onClick={() => {
                            setCompleted(false);
                            generatePuzzlePieces(previewUrl, puzzleSize).then(pieces => {
                              setPuzzlePieces(pieces);
                            });
                          }} 
                          style={{ 
                            marginTop: '1.5rem', 
                            padding: '0.5rem 1.5rem', 
                            fontSize: '1.1rem', 
                            borderRadius: '0.5rem', 
                            border: 'none', 
                            background: '#0099cc', 
                            color: '#fff', 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            zIndex: 20 
                          }}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: '#666', fontSize: '1.2rem' }}>
                  Please upload an image first
                </div>
              )}
            </div>
          ) : (
            // Custom Shapes (Broken Glass, Squares, etc.)
            <>
              {/* Shuffle button at top left of play area */}
              <button
            onClick={() => {
              // Find all unique groupIds
              // const uniqueGroupIds = Array.from(new Set(groupIds));
              // For each group, if it has only one piece (unmerged), reshuffle it
              setPiecePositions(prevPositions => {
                return prevPositions.map((pos, idx) => {
                  const gid = groupIds[idx];
                  // Count how many pieces are in this group
                  const groupSize = groupIds.filter(id => id === gid).length;
                  if (groupSize === 1) {
                    // Only shuffle individual pieces
                    const bbox = shardImages[idx]?.bbox || { minX: 0, minY: 0, maxX: 100, maxY: 100 };
                    const pieceWidth = (bbox.maxX - bbox.minX) * puzzleScale;
                    const pieceHeight = (bbox.maxY - bbox.minY) * puzzleScale;
                    const x = Math.random() * Math.max(1, (PLAY_AREA_WIDTH - pieceWidth));
                    const y = Math.random() * Math.max(1, (PLAY_AREA_HEIGHT - pieceHeight));
                    return { x, y };
                  }
                  // Leave merged groups in place
                  return pos;
                });
              });
            }}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 20,
              padding: '0.5rem 1.2rem',
              fontSize: '1.1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#ff8c42',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            }}
          >
            Shuffle
          </button>
          {completed && previewUrl && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(255,255,255,0.5)',
                backdropFilter: 'blur(6px)',
                zIndex: 1,
                pointerEvents: 'none',
                borderRadius: '1rem',
              }} />
              <div style={{
                position: 'relative',
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}>
                <div style={{
                  fontSize: '2.7rem',
                  fontWeight: 'bold',
                  color: '#000000',
                  marginBottom: '1.2rem',
                }}>
                  Memory Recovered!
                </div>
                <img
                  src={previewUrl}
                  alt="Completed"
                  style={{
                    width: '480px',
                    maxWidth: '70vw',
                    maxHeight: '60vh',
                    objectFit: 'contain',
                    borderRadius: '0.5rem',
                    marginTop: '1.0rem',
                    marginBottom: '1.0rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                  }}
                />
                <button onClick={handleShuffle} style={{ marginTop: '1.5rem', padding: '0.5rem 1.5rem', fontSize: '1.1rem', borderRadius: '0.5rem', border: 'none', background: '#0099cc', color: '#fff', cursor: 'pointer', fontWeight: 'bold', zIndex: 20 }}>
                  Reset
                </button>
              </div>
            </div>
          )}
          <Stage
            width={PLAY_AREA_WIDTH}
            height={PLAY_AREA_HEIGHT}
            style={{ borderRadius: '1rem', background: '#222', width: '100%', height: PLAY_AREA_HEIGHT, position: 'absolute', left: 0, top: 0 }}
          >
            <Layer ref={layerRef}>
              {groupIds.length > 0 &&
                Array.from(new Set(groupIds)).map(groupId => {
                  // Find all piece indices in this group
                  const groupPieceIndices = groupIds.map((gid, idx) => gid === groupId ? idx : -1).filter(idx => idx !== -1);
                  // Use the first piece in the group as the drag handle
                  const firstIdx = groupPieceIndices[0];
                  // Calculate group offset (use the first piece's position)
                  // const groupOffset = piecePositions[firstIdx];
                  return (
                    <Group
                      key={groupId}
                      draggable
                      x={0}
                      y={0}
                      dragBoundFunc={(pos, evt) => pos}
                      onDragEnd={e => {
                        const dragDelta = {
                          x: e.target.x(),
                          y: e.target.y(),
                        };
                        const newPositions = [...piecePositions];
                        groupPieceIndices.forEach((idx) => {
                          if (groupIds[idx] === groupId) {
                            newPositions[idx] = {
                              x: piecePositions[idx].x + dragDelta.x,
                              y: piecePositions[idx].y + dragDelta.y,
                            };
                          }
                        });
                        setPiecePositions(newPositions);
                        e.target.x(0);
                        e.target.y(0);
                        // Snap logic
                        let snapped = false;
                        let snapDelta = { x: 0, y: 0 };
                        let mergeWithGroupId = null;
                        // let mergeIndices = [];
                        let snappedEdgeInfo = null;
                        for (const idx of groupPieceIndices) {
                          const shape = triangles[idx];
                          const shapeEdges = getShapeEdges(shape);
                          const shapePos = piecePositions[idx];
                          for (let edgeIdx = 0; edgeIdx < shapeEdges.length; edgeIdx++) {
                            const edge = shapeEdges[edgeIdx];
                            const edgeA = [edge[0][0] + shapePos.x, edge[0][1] + shapePos.y];
                            const edgeB = [edge[1][0] + shapePos.x, edge[1][1] + shapePos.y];
                            for (const neighborIdx of neighbors[idx] || []) {
                              if (groupIds[neighborIdx] === groupId) continue;
                              const neighborShape = triangles[neighborIdx];
                              const neighborEdges = getShapeEdges(neighborShape);
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
                                  let chosenEdgeIdx = edgeIdx;
                                  if (distA < distB) {
                                    finalDelta = deltaA;
                                  } else {
                                    finalDelta = deltaA2;
                                  }
                                  snapDelta = { x: finalDelta[0], y: finalDelta[1] };
                                  mergeWithGroupId = groupIds[neighborIdx];
                                  snapped = true;
                                  // Store the snapped edge as piece index and edge index
                                  snappedEdgeInfo = {
                                    idx: idx,
                                    edgeIdx: edgeIdx
                                  };
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
                          // Visual feedback: softly glow the snapped shard for 300ms
                          if (snappedEdgeInfo) {
                            setJustSnappedShard(snappedEdgeInfo.idx);
                            setTimeout(() => setJustSnappedShard(null), 300);
                          }
                        }
                      }}
                      scale={{
                        x: 1,
                        y: 1,
                      }}
                    >
                      {groupIds.map((gid, idx) => {
                        if (gid !== groupId) return null;
                        const { img, bbox } = shardImages[idx];
                        const groupX = (bbox.minX * puzzleScale) + piecePositions[idx].x;
                        const groupY = (bbox.minY * puzzleScale) + piecePositions[idx].y;
                        return (
                          <KonvaImage
                            key={idx}
                            image={img}
                            width={(bbox.maxX - bbox.minX) * puzzleScale}
                            height={(bbox.maxY - bbox.minY) * puzzleScale}
                            x={(bbox.minX * puzzleScale) + piecePositions[idx].x}
                            y={(bbox.minY * puzzleScale) + piecePositions[idx].y}
                            shadowForStrokeEnabled={false}
                            shadowEnabled={justSnappedShard === idx}
                            shadowColor={justSnappedShard === idx ? '#fff' : undefined}
                            shadowBlur={justSnappedShard === idx ? 50 : 0}
                            shadowOpacity={justSnappedShard === idx ? 1 : 0}
                            stroke={undefined}
                            strokeWidth={0}
                          />
                        );
                      })}
                    </Group>
                  );
                })}
            </Layer>
          </Stage>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
