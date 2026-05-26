/**
 * MotionScope 3D - BVH File Parser and Kinematics Engine
 */

class BVHJoint {
    constructor(name, parent = null) {
        this.name = name;
        this.parent = parent;
        this.children = [];
        this.offset = new THREE.Vector3(0, 0, 0);
        this.channels = [];
        this.channelIndices = {};
        this.channelStartIndex = 0;
        this.matrix = new THREE.Matrix4(); // World matrix
        this.endSite = null; // THREE.Vector3 if it has an End Site
        this.depth = 0;
    }

    addChild(child) {
        this.children.push(child);
        child.depth = this.depth + 1;
    }
}

class BVHData {
    constructor() {
        this.rootJoint = null;
        this.joints = {}; // Map of name -> BVHJoint
        this.jointOrder = []; // Depth-first traversal order
        this.motionData = []; // 2D Array [frameCount][channelCount]
        this.frameCount = 0;
        this.frameTime = 0.0; // In seconds
        this.fps = 0.0;
        this.totalDuration = 0.0; // In seconds
        this.channelCount = 0;
    }
}

/**
 * Robustly parses a BVH text content
 * @param {string} text - Raw BVH file text
 * @returns {BVHData|null} - Parsed BVH data or null if invalid
 */
function parseBVH(text) {
    if (!text || text.trim() === "") {
        console.error("BVH Parse Error: Input text is empty");
        return null;
    }

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    const data = new BVHData();
    const stack = [];
    let lineIndex = 0;
    let channelCount = 0;

    try {
        // --- Part 1: HIERARCHY ---
        if (lines[lineIndex] !== "HIERARCHY") {
            throw new Error("BVH File must start with HIERARCHY token");
        }
        lineIndex++;

        while (lineIndex < lines.length && lines[lineIndex] !== "MOTION") {
            const line = lines[lineIndex];
            const parts = line.split(/\s+/);
            const token = parts[0].toUpperCase();

            if (token === "ROOT" || token === "JOINT") {
                const jointName = parts[1];
                const parent = stack.length > 0 ? stack[stack.length - 1] : null;
                const joint = new BVHJoint(jointName, parent);

                if (!data.rootJoint) {
                    data.rootJoint = joint;
                }
                data.joints[jointName] = joint;
                data.jointOrder.push(jointName);

                if (parent) {
                    parent.addChild(joint);
                }

                stack.push(joint);
                lineIndex++;
            } 
            else if (line === "{") {
                lineIndex++;
            } 
            else if (token === "OFFSET") {
                const currentJoint = stack[stack.length - 1];
                currentJoint.offset.set(
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                );
                lineIndex++;
            } 
            else if (token === "CHANNELS") {
                const currentJoint = stack[stack.length - 1];
                const numChannels = parseInt(parts[1]);
                const channels = parts.slice(2);
                
                currentJoint.channels = channels;
                currentJoint.channelStartIndex = channelCount;
                
                for (let i = 0; i < numChannels; i++) {
                    currentJoint.channelIndices[channels[i]] = channelCount + i;
                }
                
                channelCount += numChannels;
                lineIndex++;
            } 
            else if (token === "END" && parts[1].toUpperCase() === "SITE") {
                // End Site block
                const currentJoint = stack[stack.length - 1];
                // Find next OFFSET
                lineIndex++; // Move past "End Site"
                if (lines[lineIndex] !== "{") {
                    throw new Error("Expected '{' after End Site definition");
                }
                lineIndex++; // Move past "{"
                
                const offsetParts = lines[lineIndex].split(/\s+/);
                if (offsetParts[0].toUpperCase() !== "OFFSET") {
                    throw new Error("Expected 'OFFSET' inside End Site block");
                }
                
                currentJoint.endSite = new THREE.Vector3(
                    parseFloat(offsetParts[1]),
                    parseFloat(offsetParts[2]),
                    parseFloat(offsetParts[3])
                );
                
                lineIndex++; // Move past OFFSET
                if (lines[lineIndex] !== "}") {
                    throw new Error("Expected '}' to close End Site block");
                }
                lineIndex++; // Move past "}"
            } 
            else if (line === "}") {
                if (stack.length > 0) {
                    stack.pop();
                }
                lineIndex++;
            } 
            else {
                lineIndex++;
            }
        }

        data.channelCount = channelCount;

        // --- Part 2: MOTION ---
        if (lineIndex >= lines.length || lines[lineIndex] !== "MOTION") {
            throw new Error("Missing MOTION block");
        }
        lineIndex++;

        // Parse Frames count
        if (lineIndex < lines.length && lines[lineIndex].startsWith("Frames:")) {
            const framesParts = lines[lineIndex].split(/\s+/);
            data.frameCount = parseInt(framesParts[1]);
            lineIndex++;
        } else {
            throw new Error("Expected 'Frames: <count>' under MOTION");
        }

        // Parse Frame Time
        if (lineIndex < lines.length && lines[lineIndex].startsWith("Frame Time:")) {
            const timeParts = lines[lineIndex].split(/\s+/);
            data.frameTime = parseFloat(timeParts[2]);
            data.fps = data.frameTime > 0 ? (1.0 / data.frameTime) : 60.0;
            data.totalDuration = data.frameCount * data.frameTime;
            lineIndex++;
        } else {
            throw new Error("Expected 'Frame Time: <seconds>'");
        }

        // Parse the raw motion numbers
        while (lineIndex < lines.length) {
            const rowValues = lines[lineIndex].split(/\s+/).map(val => parseFloat(val));
            if (rowValues.length >= channelCount) {
                data.motionData.push(rowValues);
            }
            lineIndex++;
        }

        // Validate frame count match
        if (data.motionData.length > 0 && data.motionData.length !== data.frameCount) {
            console.warn(`BVH Warning: Header frame count (${data.frameCount}) does not match motion data length (${data.motionData.length}). Auto-adjusting.`);
            data.frameCount = data.motionData.length;
            data.totalDuration = data.frameCount * data.frameTime;
        }

        console.log(`Successfully parsed BVH hierarchy with ${data.jointOrder.length} joints, ${data.frameCount} frames at ${data.fps.toFixed(1)}Hz`);
        return data;

    } catch (err) {
        console.error("BVH Parsing Error: ", err);
        return null;
    }
}

/**
 * Computes forward kinematics for the entire joint hierarchy at a specific frame
 * @param {BVHJoint} joint - Current joint to update (usually rootJoint)
 * @param {Array<number>} frameData - Double array representing channels at current frame
 * @param {Object} jointsMap - Reference map of all joints
 */
function updateJointMatrices(joint, frameData, jointsMap) {
    if (!joint) return;

    const localMatrix = new THREE.Matrix4();
    
    if (!joint.parent) {
        // Root joint uses its position channels if available, fallback to 0
        const posX = 'Xposition' in joint.channelIndices ? frameData[joint.channelIndices['Xposition']] : 0;
        const posY = 'Yposition' in joint.channelIndices ? frameData[joint.channelIndices['Yposition']] : 0;
        const posZ = 'Zposition' in joint.channelIndices ? frameData[joint.channelIndices['Zposition']] : 0;
        
        // Root translation matrix
        localMatrix.makeTranslation(posX, posY, posZ);
    } else {
        // Child joint translations are based solely on static offsets defined in hierarchy
        const parentJoint = jointsMap[joint.parent.name];
        localMatrix.makeTranslation(joint.offset.x, joint.offset.y, joint.offset.z);
        localMatrix.premultiply(parentJoint.matrix);
    }

    // Apply rotation channels sequentially (Euler rotations)
    joint.channels.forEach(channel => {
        if (channel.toLowerCase().includes("rotation")) {
            const axis = channel[0].toUpperCase(); // X, Y, or Z
            const angleDeg = frameData[joint.channelIndices[channel]];
            const angleRad = angleDeg * (Math.PI / 180.0);
            
            const rMatrix = new THREE.Matrix4();
            if (axis === 'X') {
                rMatrix.makeRotationX(angleRad);
            } else if (axis === 'Y') {
                rMatrix.makeRotationY(angleRad);
            } else if (axis === 'Z') {
                rMatrix.makeRotationZ(angleRad);
            }
            
            localMatrix.multiply(rMatrix);
        }
    });

    joint.matrix.copy(localMatrix);

    // Recursively update all child joints
    joint.children.forEach(child => {
        updateJointMatrices(child, frameData, jointsMap);
    });
}
