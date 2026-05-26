/**
 * MotionScope 3D - Kinematic and Biomechanical Analysis Solvers
 */

class KinematicPayload {
    constructor(frameCount) {
        this.positions = [];     // Array<Map<String, THREE.Vector3>> [frame]
        this.velocities = [];    // Array<Map<String, THREE.Vector3>> [frame]
        this.accelerations = []; // Array<Map<String, THREE.Vector3>> [frame]
        this.anatomicalAngles = []; // Array<Map<String, Number>> [frame]
        this.rom = {};           // Map<String, Array<Number>> [min, max]
    }
}

/**
 * Intelligent joint name resolver for BVH files
 * Matches standard naming conventions and common motion capture rig abbreviations
 * @param {Object} jointsMap - Parsed joints map
 * @param {string} canonicalName - The standard name (e.g., 'RightArm')
 * @returns {string|null} - The actual matched joint name in the file, or null
 */
function resolveJointName(jointsMap, canonicalName) {
    if (jointsMap[canonicalName]) return canonicalName;

    const lowerCanonical = canonicalName.toLowerCase();
    const keys = Object.keys(jointsMap);

    // Common synonyms/regex mapping
    const mappings = {
        'rightarm': [/right.*arm/i, /r.*arm/i, /r_upperarm/i, /rupperarm/i, /right_arm/i],
        'rightforearm': [/right.*forearm/i, /right.*elbow/i, /r.*forearm/i, /r_forearm/i, /right_forearm/i],
        'righthand': [/right.*hand/i, /right.*wrist/i, /r.*hand/i, /r_hand/i, /right_hand/i],
        'leftarm': [/left.*arm/i, /l.*arm/i, /l_upperarm/i, /lupperarm/i, /left_arm/i],
        'leftforearm': [/left.*forearm/i, /left.*elbow/i, /l.*forearm/i, /l_forearm/i, /left_forearm/i],
        'lefthand': [/left.*hand/i, /left.*wrist/i, /l.*hand/i, /l_hand/i, /left_hand/i],
        'rightshoulder': [/right.*shoulder/i, /r.*shoulder/i, /r_shoulder/i, /right_clavicle/i, /r_clavicle/i],
        'leftshoulder': [/left.*shoulder/i, /l.*shoulder/i, /l_shoulder/i, /left_clavicle/i, /l_clavicle/i],
        
        'righthips': [/hips/i, /pelvis/i, /root/i],
        'rightupleg': [/right.*upleg/i, /right.*thigh/i, /r.*upleg/i, /r.*thigh/i, /r_upleg/i, /r_thigh/i],
        'rightleg': [/right.*leg/i, /right.*shin/i, /right.*calf/i, /right.*knee/i, /r.*leg/i, /r.*shin/i, /r_leg/i, /r_shin/i],
        'rightfoot': [/right.*foot/i, /right.*ankle/i, /r.*foot/i, /r_foot/i, /r_ankle/i],
        'leftupleg': [/left.*upleg/i, /left.*thigh/i, /l.*upleg/i, /l.*thigh/i, /l_upleg/i, /l_thigh/i],
        'leftleg': [/left.*leg/i, /left.*shin/i, /left.*calf/i, /left.*knee/i, /l.*leg/i, /l.*shin/i, /l_leg/i, /l_shin/i],
        'leftfoot': [/left.*foot/i, /left.*ankle/i, /l.*foot/i, /l_foot/i, /l_ankle/i],
        'hips': [/hips/i, /pelvis/i, /root/i, /bip01/i]
    };

    const targetRegexes = mappings[lowerCanonical];
    if (targetRegexes) {
        for (const rx of targetRegexes) {
            const matched = keys.find(k => rx.test(k));
            if (matched) return matched;
        }
    }

    // Direct case-insensitive search
    const exactCaseInsensitive = keys.find(k => k.toLowerCase() === lowerCanonical);
    if (exactCaseInsensitive) return exactCaseInsensitive;

    return null;
}

/**
 * Solves absolute coordinates for all joints across all frames
 * Then calculates velocities, accelerations, and biomechanical metrics
 * @param {BVHData} bvhData - The fully parsed BVH data structure
 * @returns {KinematicPayload} - The calculated outputs
 */
function solveKinematics(bvhData) {
    const frameCount = bvhData.frameCount;
    const payload = new KinematicPayload(frameCount);
    const dt = bvhData.frameTime;

    // Resolve joint maps for biomechanics
    const names = {
        RHips: resolveJointName(bvhData.joints, 'hips'),
        RShoulder: resolveJointName(bvhData.joints, 'RightShoulder'),
        RArm: resolveJointName(bvhData.joints, 'RightArm'),
        RForeArm: resolveJointName(bvhData.joints, 'RightForeArm'),
        RHand: resolveJointName(bvhData.joints, 'RightHand'),
        
        LShoulder: resolveJointName(bvhData.joints, 'LeftShoulder'),
        LArm: resolveJointName(bvhData.joints, 'LeftArm'),
        LForeArm: resolveJointName(bvhData.joints, 'LeftForeArm'),
        LHand: resolveJointName(bvhData.joints, 'LeftHand'),
        
        RUpLeg: resolveJointName(bvhData.joints, 'RightUpLeg'),
        RLeg: resolveJointName(bvhData.joints, 'RightLeg'),
        RFoot: resolveJointName(bvhData.joints, 'RightFoot'),
        
        LUpLeg: resolveJointName(bvhData.joints, 'LeftUpLeg'),
        LLeg: resolveJointName(bvhData.joints, 'LeftLeg'),
        LFoot: resolveJointName(bvhData.joints, 'LeftFoot')
    };

    // --- Phase 1: Precompute World Positions for each Frame ---
    for (let f = 0; f < frameCount; f++) {
        const frameData = bvhData.motionData[f];
        
        // Deep copy matrices inside joint hierarchy
        updateJointMatrices(bvhData.rootJoint, frameData, bvhData.joints);
        
        const framePositions = {};
        bvhData.jointOrder.forEach(jointName => {
            const joint = bvhData.joints[jointName];
            const worldPos = new THREE.Vector3().setFromMatrixPosition(joint.matrix);
            framePositions[jointName] = worldPos;
        });
        
        payload.positions.push(framePositions);
    }

    // --- Phase 2: Solve Linear Kinematics (Velocity and Acceleration) ---
    for (let f = 0; f < frameCount; f++) {
        const frameVels = {};
        const frameAccels = {};

        bvhData.jointOrder.forEach(jointName => {
            if (f === 0 || f === 1 || dt === 0) {
                frameVels[jointName] = new THREE.Vector3(0, 0, 0);
                frameAccels[jointName] = new THREE.Vector3(0, 0, 0);
            } else {
                // Velocity: v = (pos[t] - pos[t-1]) / dt
                const posCurrent = payload.positions[f][jointName];
                const posPrev = payload.positions[f - 1][jointName];
                const velocity = new THREE.Vector3().subVectors(posCurrent, posPrev).divideScalar(dt);
                frameVels[jointName] = velocity;

                // Acceleration: a = (vel[t] - vel[t-1]) / dt
                const velPrev = payload.velocities[f - 1][jointName];
                const acceleration = new THREE.Vector3().subVectors(velocity, velPrev).divideScalar(dt);
                frameAccels[jointName] = acceleration;
            }
        });

        payload.velocities.push(frameVels);
        payload.accelerations.push(frameAccels);
    }

    // Helper functions for 3D vector angles
    function getAngle(p1, p2, p3) {
        if (!p1 || !p2 || !p3) return null;
        const v1 = new THREE.Vector3().subVectors(p1, p2);
        const v2 = new THREE.Vector3().subVectors(p3, p2);
        if (v1.lengthSq() < 0.0001 || v2.lengthSq() < 0.0001) return 0.0;
        
        const angleRad = v1.angleTo(v2);
        return angleRad * (180.0 / Math.PI);
    }

    function getSignedAngle(v1, v2, axis) {
        if (v1.lengthSq() < 0.0001 || v2.lengthSq() < 0.0001) return 0.0;
        const v1Norm = v1.clone().normalize();
        const v2Norm = v2.clone().normalize();
        
        let cosTheta = v1Norm.dot(v2Norm);
        let angleRad = Math.acos(THREE.MathUtils.clamp(cosTheta, -1.0, 1.0));
        
        const cross = new THREE.Vector3().crossVectors(v1Norm, v2Norm);
        const sign = Math.sign(cross.dot(axis));
        
        return angleRad * (180.0 / Math.PI) * (sign === 0 ? 1 : sign);
    }

    const Y_AXIS = new THREE.Vector3(0, 1, 0);
    const Z_AXIS = new THREE.Vector3(0, 0, 1);
    const X_AXIS = new THREE.Vector3(1, 0, 0);

    // --- Phase 3: Solve Anatomical Angles ---
    for (let f = 0; f < frameCount; f++) {
        const framePositions = payload.positions[f];
        const angles = {};

        // 1. Right Elbow Flexion
        if (names.RArm && names.RForeArm && names.RHand) {
            angles['RightElbow_Flexion'] = getAngle(
                framePositions[names.RArm],
                framePositions[names.RForeArm],
                framePositions[names.RHand]
            );
        }
        
        // 2. Left Elbow Flexion
        if (names.LArm && names.LForeArm && names.LHand) {
            angles['LeftElbow_Flexion'] = getAngle(
                framePositions[names.LArm],
                framePositions[names.LForeArm],
                framePositions[names.LHand]
            );
        }

        // 3. Right Knee Flexion
        if (names.RUpLeg && names.RLeg && names.RFoot) {
            angles['RightKnee_Flexion'] = getAngle(
                framePositions[names.RUpLeg],
                framePositions[names.RLeg],
                framePositions[names.RFoot]
            );
        }

        // 4. Left Knee Flexion
        if (names.LUpLeg && names.LLeg && names.LFoot) {
            angles['LeftKnee_Flexion'] = getAngle(
                framePositions[names.LUpLeg],
                framePositions[names.LLeg],
                framePositions[names.LFoot]
            );
        }

        // 5. Right Shoulder Abduction & Flexion
        if (names.RShoulder && names.RArm) {
            const armVec = new THREE.Vector3().subVectors(framePositions[names.RArm], framePositions[names.RShoulder]);
            
            // Abduction on YZ Plane
            const yzPlaneVec = new THREE.Vector3(0, armVec.y, armVec.z);
            angles['RightShoulder_Abduction'] = getSignedAngle(Y_AXIS, yzPlaneVec, X_AXIS);

            // Flexion on XY Plane
            const xyPlaneVec = new THREE.Vector3(armVec.x, armVec.y, 0);
            angles['RightShoulder_Flexion'] = getSignedAngle(Y_AXIS, xyPlaneVec, Z_AXIS);
        }

        // 6. Left Shoulder Abduction & Flexion
        if (names.LShoulder && names.LArm) {
            const armVec = new THREE.Vector3().subVectors(framePositions[names.LArm], framePositions[names.LShoulder]);
            
            // Abduction on YZ Plane
            const yzPlaneVec = new THREE.Vector3(0, armVec.y, armVec.z);
            angles['LeftShoulder_Abduction'] = getSignedAngle(Y_AXIS, yzPlaneVec, new THREE.Vector3().copy(X_AXIS).negate());

            // Flexion on XY Plane
            const xyPlaneVec = new THREE.Vector3(armVec.x, armVec.y, 0);
            angles['LeftShoulder_Flexion'] = getSignedAngle(Y_AXIS, xyPlaneVec, new THREE.Vector3().copy(Z_AXIS).negate());
        }

        // 7. Right Hip Flexion
        if (names.RHips && names.RUpLeg) {
            const legVec = new THREE.Vector3().subVectors(framePositions[names.RUpLeg], framePositions[names.RHips]);
            const yzPlaneVec = new THREE.Vector3(0, legVec.y, legVec.z);
            angles['RightHip_Flexion'] = getSignedAngle(Y_AXIS, yzPlaneVec, new THREE.Vector3().copy(X_AXIS).negate());
        }

        // 8. Left Hip Flexion
        if (names.RHips && names.LUpLeg) {
            const legVec = new THREE.Vector3().subVectors(framePositions[names.LUpLeg], framePositions[names.RHips]);
            const yzPlaneVec = new THREE.Vector3(0, legVec.y, legVec.z);
            angles['LeftHip_Flexion'] = getSignedAngle(Y_AXIS, yzPlaneVec, X_AXIS);
        }

        // Filter null values
        const cleanedAngles = {};
        for (const [key, val] of Object.entries(angles)) {
            if (val !== null && !isNaN(val)) {
                cleanedAngles[key] = val;
            }
        }

        payload.anatomicalAngles.push(cleanedAngles);
    }

    // --- Phase 4: Precompute Range of Motion (ROM) ---
    if (payload.anatomicalAngles.length > 0) {
        // Collect all available angle keys
        const angleKeys = Object.keys(payload.anatomicalAngles[0]);
        
        angleKeys.forEach(key => {
            payload.rom[key] = [Infinity, -Infinity]; // [min, max]
        });

        for (let f = 0; f < frameCount; f++) {
            const frameAngles = payload.anatomicalAngles[f];
            angleKeys.forEach(key => {
                const val = frameAngles[key];
                if (val !== undefined && val !== null) {
                    if (val < payload.rom[key][0]) payload.rom[key][0] = val;
                    if (val > payload.rom[key][1]) payload.rom[key][1] = val;
                }
            });
        }
    }

    console.log(`Kinematics precomputations completed. Positions: ${payload.positions.length}, ROM records: ${Object.keys(payload.rom).length}`);
    return payload;
}
