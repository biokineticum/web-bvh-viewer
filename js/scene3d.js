/**
 * MotionScope 3D - Three.js WebGL 3D Visualization Engine
 */

class MotionScene3D {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        
        // Scene Objects
        this.gridHelper = null;
        this.ambientLight = null;
        this.dirLight = null;
        this.skeletalGroup = null; // Container for bones and joint meshes
        this.trajectoryGroup = null; // Container for path lines
        
        // Render State
        this.renderMode = 'cyber'; // 'cyber' or 'solid'
        this.showGrid = true;
        this.showTrajectories = false;
        
        // Mesh Cache
        this.jointMeshes = {}; // Map of name -> THREE.Mesh
        this.boneMeshes = [];  // List of bone cylinders/lines
        this.endSiteMeshes = []; // List of end site meshes
        
        // Trajectory Tracing
        this.tracedJoints = new Set(); // Set of joint names to trace
        this.trajectoryLines = {};    // Map of jointName -> THREE.Line
        
        // FPS Counter
        this.lastFrameTime = performance.now();
        this.fpsCount = 0;
        this.fpsUpdateInterval = 1000; // ms
        this.lastFpsUpdate = performance.now();
        
        this.init();
    }

    init() {
        // 1. Create Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        // 2. Create Scene
        this.scene = new THREE.Scene();
        // Fog removed to prevent the yellow character from getting dark or fading when moving/playing

        // 3. Create Camera
        this.camera = new THREE.PerspectiveCamera(
            45,
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            2000
        );
        this.camera.position.set(0, 150, 400);

        // 4. Create OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // Don't go below ground
        this.controls.target.set(0, 80, 0);

        // 5. Setup Lighting
        this.setupLighting();

        // 6. Setup Helpers
        this.setupHelpers();

        // 7. Create Groups
        this.skeletalGroup = new THREE.Group();
        this.scene.add(this.skeletalGroup);

        this.trajectoryGroup = new THREE.Group();
        this.scene.add(this.trajectoryGroup);

        // 8. Event Listeners
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLighting() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.ambientLight);

        // Cyber Hemi Light using glowing warm cyber rim hues (Gold/Orange)
        const hemiLight = new THREE.HemisphereLight(0xffea00, 0xff5500, 0.7);
        hemiLight.position.set(0, 200, 0);
        this.scene.add(hemiLight);

        // Main shadow casting light
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.dirLight.position.set(100, 300, 150);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 1000;
        
        const d = 250;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.dirLight.shadow.bias = -0.0005;
        this.scene.add(this.dirLight);

        // Secondary fill-light pointing from opposite side for premium contrast
        const fillLight = new THREE.DirectionalLight(0xffea00, 0.6);
        fillLight.position.set(-100, 100, -150);
        this.scene.add(fillLight);
    }

    setupHelpers() {
        // High-tech circular grid floor instead of a standard boring rectangular grid
        this.gridHelper = new THREE.GridHelper(800, 80, 0x66fcf1, 0x1f2937);
        this.gridHelper.position.y = -0.5;
        this.gridHelper.material.opacity = 0.2;
        this.gridHelper.material.transparent = true;
        this.scene.add(this.gridHelper);

        // Add a subtle glowing ground disk
        const groundGeo = new THREE.PlaneGeometry(800, 800);
        const groundMat = new THREE.ShadowMaterial({ opacity: 0.4 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    onWindowResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    /**
     * Recreates the visual representation of the joint tree
     * Done once a new BVH file is successfully loaded
     */
    buildSkeleton(bvhData) {
        // 1. Clear existing skeleton meshes
        this.clearSkeleton();
        this.clearTrajectories();

        if (!bvhData) return;

        // Materials setup - High Contrast Cyber Yellow & Amber
        const jointMat = new THREE.MeshStandardMaterial({
            color: 0xffe600, // Bright Neon Yellow
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0xffe600,
            emissiveIntensity: 0.35 // Intensely glowing joints
        });

        const boneMat = new THREE.MeshStandardMaterial({
            color: 0xff7300, // Cyber Amber/Orange
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0xff7300,
            emissiveIntensity: 0.25 // Glowing bones
        });

        const endSiteMat = new THREE.MeshStandardMaterial({
            color: 0xffff00, // High-visibility Yellow
            metalness: 0.7,
            roughness: 0.3,
            emissive: 0xffff00,
            emissiveIntensity: 0.3
        });

        // Scale factors: PyOpenGL values are large, we maintain sizing but adjust joint radius
        const jointRadius = 2.0;

        // 2. Instantiate meshes for each joint with cloned materials and no self-shadowing to maintain bright colors
        bvhData.jointOrder.forEach(name => {
            const joint = bvhData.joints[name];
            
            // Sphere for joint node (cloned material for individual highlighting)
            const jointGeo = new THREE.SphereGeometry(jointRadius, 16, 16);
            const jointMesh = new THREE.Mesh(jointGeo, jointMat.clone());
            jointMesh.castShadow = true;
            jointMesh.receiveShadow = false; // No self-shadowing to prevent dark spots
            jointMesh.name = name;
            
            this.jointMeshes[name] = jointMesh;
            this.skeletalGroup.add(jointMesh);

            // Connect to parent with bone cylinder
            if (joint.parent) {
                const boneGeo = new THREE.CylinderGeometry(jointRadius * 0.4, jointRadius * 0.5, 1, 8);
                const boneMesh = new THREE.Mesh(boneGeo, boneMat.clone());
                boneMesh.castShadow = true;
                boneMesh.receiveShadow = false; // No self-shadowing
                boneMesh.userData = { parent: joint.parent.name, child: name };
                
                this.boneMeshes.push(boneMesh);
                this.skeletalGroup.add(boneMesh);
            }

            // Draw End Site
            if (joint.endSite) {
                // Joint sphere for End Site tip
                const endGeo = new THREE.SphereGeometry(jointRadius * 0.6, 12, 12);
                const endMesh = new THREE.Mesh(endGeo, endSiteMat.clone());
                endMesh.castShadow = true;
                endMesh.receiveShadow = false;
                this.skeletalGroup.add(endMesh);
                
                // Bone connecting joint to End Site tip
                const tipBoneGeo = new THREE.CylinderGeometry(jointRadius * 0.3, jointRadius * 0.1, 1, 8);
                const tipBoneMesh = new THREE.Mesh(tipBoneGeo, endSiteMat.clone());
                tipBoneMesh.castShadow = true;
                tipBoneMesh.receiveShadow = false;
                
                this.endSiteMeshes.push({
                    jointName: name,
                    sphere: endMesh,
                    cylinder: tipBoneMesh
                });
                
                this.skeletalGroup.add(tipBoneMesh);
            }
        });

        // Initial view reset
        this.resetCamera(bvhData);
    }

    clearSkeleton() {
        // Traverse and dispose geometries and materials
        while(this.skeletalGroup.children.length > 0) {
            const obj = this.skeletalGroup.children[0];
            this.skeletalGroup.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        }
        this.jointMeshes = {};
        this.boneMeshes = [];
        this.endSiteMeshes = [];
    }

    /**
     * Updates positions and alignments of all skeletal meshes based on precomputed frame coordinates
     * @param {Object} framePositions - Map of jointName -> THREE.Vector3
     * @param {BVHData} bvhData - The active parsed BVH dataset
     * @param {number} frameIndex - The index of the current frame
     */
    updateFrame(framePositions, bvhData, frameIndex) {
        if (!framePositions || Object.keys(this.jointMeshes).length === 0) return;

        // Force forward kinematics updates to keep joint.matrix perfectly synchronized with current frame.
        // This solves the desynchronized End Site stretched line lines!
        if (bvhData && frameIndex !== undefined && frameIndex !== null) {
            updateJointMatrices(bvhData.rootJoint, bvhData.motionData[frameIndex], bvhData.joints);
        }

        // 1. Update Joint Spheres
        for (const [name, mesh] of Object.entries(this.jointMeshes)) {
            const pos = framePositions[name];
            if (pos) {
                mesh.position.copy(pos);
            }
        }

        // 2. Update Bone Cylinders
        this.boneMeshes.forEach(bone => {
            const pName = bone.userData.parent;
            const cName = bone.userData.child;
            const posParent = framePositions[pName];
            const posChild = framePositions[cName];

            if (posParent && posChild) {
                this.alignCylinder(bone, posParent, posChild);
            }
        });

        // 3. Update End Site Cylinders/Spheres
        this.endSiteMeshes.forEach(item => {
            const joint = bvhData.joints[item.jointName];
            const posJoint = framePositions[item.jointName];

            if (joint && posJoint) {
                // Calculate static endsite offset rotated into world space
                // joint.matrix now holds the 100% correct rotation of current frame
                const localEndSite = joint.endSite.clone();
                const worldEndSite = localEndSite.applyMatrix4(joint.matrix);
                
                // Position sphere at tip
                item.sphere.position.copy(worldEndSite);
                
                // Cylinder between joint and tip
                this.alignCylinder(item.cylinder, posJoint, worldEndSite);
            }
        });
    }

    /**
     * Core vector geometry utility to stretch and orient a cylinder from A to B
     */
    alignCylinder(cylinder, A, B) {
        const dir = new THREE.Vector3().subVectors(B, A);
        const len = dir.length();
        const midpoint = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);

        // Scale length (defaults to 1 unit)
        cylinder.scale.set(1, len, 1);
        cylinder.position.copy(midpoint);

        // Rotate cylinder (points along Y direction [0,1,0] by default)
        const defaultDirection = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDirection, dir.normalize());
        cylinder.quaternion.copy(quaternion);
    }

    /**
     * Resets OrbitControls target and camera viewport to encase the skeleton
     */
    resetCamera(bvhData) {
        if (!bvhData || !bvhData.rootJoint) return;

        // Focus on Hips joint at frame 0 if available
        let rootOffset = new THREE.Vector3(0, 80, 0);
        if (bvhData.rootJoint.offset) {
            rootOffset.copy(bvhData.rootJoint.offset);
            // If offset is extremely small or zero, fallback to height
            if (rootOffset.lengthSq() < 10) {
                rootOffset.set(0, 80, 0);
            }
        }

        // Set orbit control target to skeleton center
        this.controls.target.copy(rootOffset);

        // Adjust camera back
        this.camera.position.set(0, rootOffset.y + 50, rootOffset.y * 2 + 250);
        this.controls.update();
        
        console.log(`Viewport centered on root node: [${rootOffset.x}, ${rootOffset.y}, ${rootOffset.z}]`);
    }

    setRenderMode(mode) {
        if (mode !== 'cyber' && mode !== 'solid') return;
        this.renderMode = mode;

        // Modify styles/materials based on selection
        const isCyber = mode === 'cyber';
        
        // Glowing Neon Yellow/Gold for Cyber, bright solid Canary Yellow & dark slate for Solid
        const jointColor = isCyber ? 0xffe600 : 0xffea00;
        const boneColor = isCyber ? 0xff7300 : 0x222222;
        
        // Update joint materials
        for (const [name, mesh] of Object.entries(this.jointMeshes)) {
            mesh.material.color.setHex(jointColor);
            mesh.material.metalness = isCyber ? 0.9 : 0.1;
            mesh.material.roughness = isCyber ? 0.1 : 0.9;
            mesh.material.emissiveIntensity = isCyber ? 0.35 : 0.0;
            if (!isCyber) {
                mesh.material.emissive.setHex(0x000000);
            } else {
                mesh.material.emissive.setHex(jointColor);
            }
        }

        // Update bone materials
        this.boneMeshes.forEach(bone => {
            bone.material.color.setHex(boneColor);
            bone.material.metalness = isCyber ? 0.8 : 0.2;
            bone.material.roughness = isCyber ? 0.2 : 0.8;
            bone.material.emissiveIntensity = isCyber ? 0.25 : 0.0;
            if (!isCyber) {
                bone.material.emissive.setHex(0x000000);
            } else {
                bone.material.emissive.setHex(boneColor);
            }
        });

        // Update end site materials
        this.endSiteMeshes.forEach(item => {
            item.sphere.material.color.setHex(isCyber ? 0xffff00 : 0xffea00);
            item.cylinder.material.color.setHex(isCyber ? 0xffff00 : 0x222222);
        });
    }

    setGridVisibility(visible) {
        this.showGrid = visible;
        this.gridHelper.visible = visible;
    }

    // --- Trajectory Tracing Engine ---
    
    toggleJointTrace(jointName, active) {
        if (active) {
            this.tracedJoints.add(jointName);
            // Highlight sphere in scene with a very intense glowing hot pink
            if (this.jointMeshes[jointName]) {
                this.jointMeshes[jointName].material.emissive.setHex(0xff0055);
                this.jointMeshes[jointName].material.emissiveIntensity = 0.9;
            }
        } else {
            this.tracedJoints.delete(jointName);
            // Restore color
            if (this.jointMeshes[jointName]) {
                const isCyber = this.renderMode === 'cyber';
                const jointColor = isCyber ? 0xffe600 : 0x000000;
                this.jointMeshes[jointName].material.emissive.setHex(jointColor);
                this.jointMeshes[jointName].material.emissiveIntensity = isCyber ? 0.35 : 0.0;
            }
            this.clearTraceLine(jointName);
        }
    }

    clearTraceLine(jointName) {
        if (this.trajectoryLines[jointName]) {
            this.trajectoryGroup.remove(this.trajectoryLines[jointName]);
            this.trajectoryLines[jointName].geometry.dispose();
            this.trajectoryLines[jointName].material.dispose();
            delete this.trajectoryLines[jointName];
        }
    }

    clearTrajectories() {
        while(this.trajectoryGroup.children.length > 0) {
            const line = this.trajectoryGroup.children[0];
            this.trajectoryGroup.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        }
        this.trajectoryLines = {};
        this.tracedJoints.clear();
    }

    /**
     * Accumulates historical paths and redraws glowing tracers up to current frame index
     */
    updateTrajectories(positionsPerFrame, currentFrameIndex) {
        if (!this.showTrajectories || this.tracedJoints.size === 0) {
            this.trajectoryGroup.visible = false;
            return;
        }

        this.trajectoryGroup.visible = true;

        this.tracedJoints.forEach(jointName => {
            // Compile points up to current frame
            const points = [];
            const traceColor = 0x00ff87; // Glow green tracer
            
            for (let f = 0; f <= currentFrameIndex; f++) {
                if (positionsPerFrame[f] && positionsPerFrame[f][jointName]) {
                    points.push(positionsPerFrame[f][jointName]);
                }
            }

            if (points.length < 2) {
                this.clearTraceLine(jointName);
                return;
            }

            // Create/Update Three.js line geometry
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            
            if (this.trajectoryLines[jointName]) {
                // Update geometry buffer
                this.trajectoryLines[jointName].geometry.dispose();
                this.trajectoryLines[jointName].geometry = geometry;
            } else {
                // Create a beautiful glowing line material
                const material = new THREE.LineBasicMaterial({
                    color: traceColor,
                    linewidth: 2, // Note: WebGL standard ignores line thickness, but it looks neat
                    transparent: true,
                    opacity: 0.8
                });
                
                const line = new THREE.Line(geometry, material);
                this.trajectoryLines[jointName] = line;
                this.trajectoryGroup.add(line);
            }
        });
    }

    /**
     * Render loop frame tick
     * Computes render frame rates dynamically
     */
    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        
        // FPS telemetry computation
        this.fpsCount++;
        const now = performance.now();
        if (now - this.lastFpsUpdate >= this.fpsUpdateInterval) {
            const calculatedFps = Math.round((this.fpsCount * 1000) / (now - this.lastFpsUpdate));
            
            // Dispatch event to update UI
            const fpsEvent = new CustomEvent('viewport-fps', { detail: { fps: calculatedFps } });
            window.dispatchEvent(fpsEvent);
            
            this.fpsCount = 0;
            this.lastFpsUpdate = now;
        }
    }
}
