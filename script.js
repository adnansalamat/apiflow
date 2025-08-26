document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const sidebar = document.getElementById('sidebar');
    const canvasContainer = document.getElementById('canvas-container');
    const propertiesPanel = document.getElementById('properties-panel');
    const saveBtn = document.getElementById('save-btn');
    const loadBtn = document.getElementById('load-btn');
    const runBtn = document.getElementById('run-btn');

    const CORS_PROXY_URL = 'https://corsproxy.io/?';
    const GRID_SIZE = 20;

    const style = getComputedStyle(document.documentElement);
    const nodeColors = {
        bodyBg: style.getPropertyValue('--node-body-bg'),
        text: style.getPropertyValue('--node-text-color'),
        border: style.getPropertyValue('--node-border-color'),
        selected: style.getPropertyValue('--node-selected-color'),
        executing: 'lime',
        success: style.getPropertyValue('--node-success-color'),
        failed: style.getPropertyValue('--node-failed-color'),
        header: {
            default: style.getPropertyValue('--node-header-bg'),
            start: style.getPropertyValue('--node-start-header-bg'),
            simple: style.getPropertyValue('--node-simple-header-bg'),
            http: style.getPropertyValue('--node-http-header-bg'),
            branch: style.getPropertyValue('--node-branch-header-bg'),
            merge: style.getPropertyValue('--node-merge-header-bg'),
        }
    };

    let nodes = [];
    let connections = [];
    let draggingNode = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let selectedNodeId = null;
    let executingNodeIds = [];

    let isConnecting = false;
    let connectionStart = { node: null, connector: null };

    let scale = 1;
    let panOffset = { x: 0, y: 0 };
    let isPanning = false;
    let lastMousePosition = { x: 0, y: 0 };
    let worldMousePosition = { x: 0, y: 0 };

    const connectorRadius = 8;
    const nodeWidth = 160;
    const nodeHeight = 60;
    const headerHeight = 24;

    function saveWorkflow() {
        const workflow = { nodes, connections, panOffset, scale };
        localStorage.setItem('n8n-clone-workflow', JSON.stringify(workflow));
        alert('Workflow saved!');
    }

    function loadWorkflow() {
        const savedWorkflow = localStorage.getItem('n8n-clone-workflow');
        if (savedWorkflow) {
            const workflow = JSON.parse(savedWorkflow);
            nodes = workflow.nodes;
            nodes.forEach(node => {
                if (node.outputData === undefined) node.outputData = null;
                if (node.status === undefined) node.status = 'idle';
            });
            connections = workflow.connections;
            panOffset = workflow.panOffset || { x: 0, y: 0 };
            scale = workflow.scale || 1;
            selectedNodeId = null;
            updatePropertiesPanel();
            draw();
        }
    }

    function getValueFromPath(obj, path) {
        if (!path) return undefined;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    async function executeNode(node, inputData) {
        let outputData = { ...inputData };
        try {
            if (node.type === 'simple') {
                outputData.processedBy = 'Simple Node';
                outputData.timestamp = new Date().toISOString();
            } else if (node.type === 'http') {
                const urlProp = node.properties.find(p => p.name === 'url');
                const methodProp = node.properties.find(p => p.name === 'method');
                const useProxyProp = node.properties.find(p => p.name === 'useProxy');
                let targetUrl = urlProp.value;
                if (useProxyProp.value) {
                    targetUrl = CORS_PROXY_URL + encodeURIComponent(targetUrl);
                }
                const response = await fetch(targetUrl, { method: methodProp.value });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                outputData = await response.json();
            }
            node.status = 'success';
            node.outputData = outputData;
            return outputData;
        } catch (error) {
            console.error(`Error executing ${node.properties.find(p => p.name === 'name').value}:`, error);
            node.status = 'failed';
            node.outputData = { error: error.message };
            throw error;
        }
    }

    async function runFrom(node, inputData) {
        if (!node) return;

        executingNodeIds.push(node.id);
        draw();

        try {
            const outputData = await executeNode(node, inputData);

            if (node.id === selectedNodeId) updatePropertiesPanel();
            await new Promise(resolve => setTimeout(resolve, 500));
            executingNodeIds = executingNodeIds.filter(id => id !== node.id);
            draw();

            let outgoingConnections = connections.filter(c => c.from.nodeId === node.id);

            if (node.type === 'branch') {
                const pathProp = node.properties.find(p => p.name === 'path').value;
                const comparisonProp = node.properties.find(p => p.name === 'comparison').value;
                const valueProp = node.properties.find(p => p.name === 'value').value;

                const dataValue = getValueFromPath(outputData, pathProp);
                let conditionResult = false;
                switch (comparisonProp) {
                    case 'equals': conditionResult = (String(dataValue) == valueProp); break;
                    case 'notEquals': conditionResult = (String(dataValue) != valueProp); break;
                    case 'contains': conditionResult = String(dataValue).includes(valueProp); break;
                    case 'greaterThan': conditionResult = (Number(dataValue) > Number(valueProp)); break;
                    case 'lessThan': conditionResult = (Number(dataValue) < Number(valueProp)); break;
                }

                const resultConnectorId = conditionResult ? 'output_true' : 'output_false';
                outgoingConnections = outgoingConnections.filter(c => c.from.connectorId === resultConnectorId);
            }

            const nextTasks = outgoingConnections.map(conn => {
                const nextNode = nodes.find(n => n.id === conn.to.nodeId);
                return runFrom(nextNode, outputData);
            });

            await Promise.all(nextTasks);

        } catch (error) {
            executingNodeIds = executingNodeIds.filter(id => id !== node.id);
            if (node.id === selectedNodeId) updatePropertiesPanel();
            draw();
        }
    }

    async function executeWorkflow() {
        nodes.forEach(n => {
            n.outputData = null;
            n.status = 'idle';
        });
        draw();

        const startNode = nodes.find(n => n.type === 'start');
        if (!startNode) {
            alert('Cannot execute workflow without a Start node.');
            return;
        }

        runBtn.disabled = true;
        await runFrom(startNode, { "initialValue": "hello world" });
        console.log('Workflow execution finished.');
        runBtn.disabled = false;
    }

    saveBtn.addEventListener('click', saveWorkflow);
    loadBtn.addEventListener('click', () => {
        if(confirm('Are you sure you want to load the last saved workflow? Any unsaved changes will be lost.')) {
            loadWorkflow();
        }
    });
    runBtn.addEventListener('click', executeWorkflow);

    function getConnectorPosition(node, connector) {
        const connectorList = connector.isInput ? node.inputs : node.outputs;
        const index = connectorList.findIndex(c => c.id === connector.id);
        const count = connectorList.length;

        const x = node.x + (connector.isInput ? 0 : node.width);
        const y = node.y + (node.height * (index + 1) / (count + 1));
        return { x, y };
    }

    function resizeCanvas() {
        canvas.width = canvasContainer.offsetWidth;
        canvas.height = canvasContainer.offsetHeight;
        draw();
    }

    window.addEventListener('resize', resizeCanvas);

    function drawGrid() {
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1 / scale;
        const left = -panOffset.x / scale;
        const top = -panOffset.y / scale;
        const right = (canvas.width - panOffset.x) / scale;
        const bottom = (canvas.height - panOffset.y) / scale;
        const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
        const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;
        ctx.beginPath();
        for (let x = startX; x < right; x += GRID_SIZE) {
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
        }
        for (let y = startY; y < bottom; y += GRID_SIZE) {
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
        }
        ctx.stroke();
    }

    function draw() {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        ctx.save();
        ctx.translate(panOffset.x, panOffset.y);
        ctx.scale(scale, scale);

        drawGrid();

        connections.forEach(conn => {
            const fromNode = nodes.find(n => n.id === conn.from.nodeId);
            const toNode = nodes.find(n => n.id === conn.to.nodeId);
            if (fromNode && toNode) {
                const fromConnector = fromNode.outputs.find(c => c.id === conn.from.connectorId);
                const toConnector = toNode.inputs.find(c => c.id === conn.to.connectorId);
                if(fromConnector && toConnector) {
                    ctx.beginPath();
                    const fromPos = getConnectorPosition(fromNode, fromConnector);
                    const toPos = getConnectorPosition(toNode, toConnector);
                    ctx.moveTo(fromPos.x, fromPos.y);
                    ctx.lineTo(toPos.x, toPos.y);
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2 / scale;
                    ctx.stroke();
                }
            }
        });

        if (isConnecting && connectionStart.node) {
            ctx.beginPath();
            const startPos = getConnectorPosition(connectionStart.node, connectionStart.connector);
            ctx.moveTo(startPos.x, startPos.y);
            ctx.lineTo(worldMousePosition.x, worldMousePosition.y);
            ctx.strokeStyle = '#777';
            ctx.lineWidth = 2 / scale;
            ctx.stroke();
        }

        nodes.forEach(node => {
            ctx.fillStyle = nodeColors.bodyBg;
            ctx.fillRect(node.x, node.y, node.width, node.height);
            ctx.fillStyle = nodeColors.header[node.type] || nodeColors.header.default;
            ctx.fillRect(node.x, node.y, node.width, headerHeight);

            let borderColor = nodeColors.border;
            if (node.status === 'failed') borderColor = nodeColors.failed;
            else if (node.status === 'success') borderColor = nodeColors.success;

            if (executingNodeIds.includes(node.id)) borderColor = nodeColors.executing;
            else if (node.id === selectedNodeId) borderColor = nodeColors.selected;

            ctx.strokeStyle = borderColor;
            ctx.lineWidth = (borderColor !== nodeColors.border ? 3 : 1) / scale;
            ctx.strokeRect(node.x, node.y, node.width, node.height);

            ctx.fillStyle = nodeColors.text;
            ctx.font = `${12 / scale}px sans-serif`;
            ctx.textAlign = 'center';
            const displayName = node.properties.find(p => p.name === 'name')?.value || node.type;
            ctx.fillText(displayName, node.x + node.width / 2, node.y + headerHeight / 2 + 4);

            [...node.inputs, ...node.outputs].forEach(connector => {
                const pos = getConnectorPosition(node, connector);
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, connectorRadius / scale, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 1 / scale;
                ctx.stroke();

                if (connector.label) {
                    ctx.fillStyle = '#555';
                    const xOffset = connector.isInput ? 15 : -15;
                    ctx.textAlign = connector.isInput ? 'left' : 'right';
                    ctx.fillText(connector.label, pos.x + xOffset, pos.y + 4);
                }
            });
            ctx.textAlign = 'left';
        });

        ctx.restore();
    }

    function updatePropertiesPanel() {
        const node = nodes.find(n => n.id === selectedNodeId);
        const propertiesTab = document.getElementById('properties-tab');
        const dataTab = document.getElementById('data-tab');

        if (node) {
            propertiesPanel.classList.add('visible');
            let propertiesContent = `<h3>${node.type} Node</h3>`;
            node.properties.forEach(prop => {
                propertiesContent += `<div class="property">`;
                if (prop.type === 'checkbox') {
                    propertiesContent += `<label><input type="checkbox" data-name="${prop.name}" ${prop.value ? 'checked' : ''}> ${prop.label}</label>`;
                } else {
                    propertiesContent += `<label for="prop-${prop.name}">${prop.label}</label>`;
                    if (prop.type === 'textarea') {
                        propertiesContent += `<textarea id="prop-${prop.name}" data-name="${prop.name}" rows="3">${prop.value}</textarea>`;
                    } else if (prop.type === 'select') {
                        propertiesContent += `<select id="prop-${prop.name}" data-name="${prop.name}">`;
                        prop.options.forEach(option => {
                            propertiesContent += `<option value="${option}" ${option === prop.value ? 'selected' : ''}>${option}</option>`;
                        });
                        propertiesContent += `</select>`;
                    } else {
                        propertiesContent += `<input type="text" id="prop-${prop.name}" data-name="${prop.name}" value="${prop.value}">`;
                    }
                }
                propertiesContent += `</div>`;
            });
            propertiesTab.innerHTML = propertiesContent;

            if (node.outputData) {
                dataTab.innerHTML = `<pre>${JSON.stringify(node.outputData, null, 2)}</pre>`;
            } else {
                dataTab.innerHTML = '<p>Run a workflow to see data</p>';
            }

        } else {
            propertiesPanel.classList.remove('visible');
        }
    }

    propertiesPanel.addEventListener('input', (e) => {
        const node = nodes.find(n => n.id === selectedNodeId);
        if (node && e.target.dataset.name) {
            const propName = e.target.dataset.name;
            const prop = node.properties.find(p => p.name === propName);
            if (prop) {
                if (e.target.type === 'checkbox') prop.value = e.target.checked;
                else prop.value = e.target.value;
                if (prop.name === 'name') draw();
            }
        }
    });

    propertiesPanel.addEventListener('click', (e) => {
        if (e.target.classList.contains('panel-tab-btn')) {
            const tabName = e.target.dataset.tab;
            propertiesPanel.querySelector('.panel-tab-btn.active').classList.remove('active');
            propertiesPanel.querySelector('.panel-tab-content.active').classList.remove('active');
            e.target.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        }
    });

    function getTransformedPoint(x, y) {
        const rect = canvas.getBoundingClientRect();
        const screenX = x - rect.left;
        const screenY = y - rect.top;
        return { x: (screenX - panOffset.x) / scale, y: (screenY - panOffset.y) / scale };
    }

    function getConnectorAtPoint(worldX, worldY) {
        for (const node of nodes) {
            for (const connector of [...node.inputs, ...node.outputs]) {
                const pos = getConnectorPosition(node, connector);
                const dist = Math.sqrt((pos.x - worldX) ** 2 + (pos.y - worldY) ** 2);
                if (dist < (connectorRadius / scale)) {
                    return { node, connector };
                }
            }
        }
        return null;
    }

    function getNodeAtPoint(worldX, worldY) {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (worldX > node.x && worldX < node.x + node.width && worldY > node.y && worldY < node.y + node.height) {
                return node;
            }
        }
        return null;
    }

    function createNewNode(x, y, type) {
        const baseNode = {
            id: Date.now(),
            type: type,
            x: x - nodeWidth / 2,
            y: y - nodeHeight / 2,
            width: nodeWidth,
            height: nodeHeight,
            properties: [],
            outputData: null,
            status: 'idle'
        };

        switch(type) {
            case 'start':
                baseNode.inputs = [];
                baseNode.outputs = [{id: 'output_1', isInput: false, label: 'Out'}];
                baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Start' });
                break;
            case 'simple':
                baseNode.inputs = [{id: 'input_1', isInput: true}];
                baseNode.outputs = [{id: 'output_1', isInput: false}];
                baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Simple Node' });
                break;
            case 'http':
                baseNode.inputs = [{id: 'input_1', isInput: true}];
                baseNode.outputs = [{id: 'output_1', isInput: false}];
                baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'HTTP Request' });
                baseNode.properties.push({ name: 'method', label: 'Method', type: 'select', value: 'GET', options: ['GET', 'POST', 'PUT', 'DELETE'] });
                baseNode.properties.push({ name: 'url', label: 'URL', type: 'textarea', value: 'https://jsonplaceholder.typicode.com/todos/1' });
                baseNode.properties.push({ name: 'useProxy', label: 'Use CORS Proxy', type: 'checkbox', value: false });
                break;
            case 'branch':
                baseNode.inputs = [{id: 'input_1', isInput: true}];
                baseNode.outputs = [{id: 'output_true', isInput: false, label: 'True'}, {id: 'output_false', isInput: false, label: 'False'}];
                baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'IF Condition' });
                baseNode.properties.push({ name: 'path', label: 'Property Path', type: 'text', value: 'initialValue' });
                baseNode.properties.push({ name: 'comparison', label: 'Comparison', type: 'select', value: 'equals', options: ['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan'] });
                baseNode.properties.push({ name: 'value', label: 'Value', type: 'text', value: 'hello world' });
                break;
            case 'merge':
                baseNode.inputs = [{id: 'input_1', isInput: true}, {id: 'input_2', isInput: true}];
                baseNode.outputs = [{id: 'output_1', isInput: false}];
                baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Merge' });
                break;
        }
        return baseNode;
    }

    sidebar.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('node-palette-item')) {
            e.dataTransfer.setData('text/plain', e.target.dataset.nodeType);
        }
    });

    canvasContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    canvasContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('text/plain');
        const worldPos = getTransformedPoint(e.clientX, e.clientY);
        const newNode = createNewNode(worldPos.x, worldPos.y, nodeType);
        nodes.push(newNode);
        draw();
    });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
            isPanning = true;
            lastMousePosition = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        worldMousePosition = getTransformedPoint(e.clientX, e.clientY);

        const connectorInfo = getConnectorAtPoint(worldMousePosition.x, worldMousePosition.y);
        if (connectorInfo && !connectorInfo.connector.isInput) {
            isConnecting = true;
            connectionStart = connectorInfo;
            selectedNodeId = null;
            updatePropertiesPanel();
            draw();
            return;
        }

        const clickedNode = getNodeAtPoint(worldMousePosition.x, worldMousePosition.y);
        if (clickedNode) {
            draggingNode = clickedNode;
            dragOffsetX = worldMousePosition.x - clickedNode.x;
            dragOffsetY = worldMousePosition.y - clickedNode.y;
            selectedNodeId = clickedNode.id;
        } else {
            selectedNodeId = null;
        }
        updatePropertiesPanel();
        draw();
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isPanning) {
            const dx = e.clientX - lastMousePosition.x;
            const dy = e.clientY - lastMousePosition.y;
            panOffset.x += dx;
            panOffset.y += dy;
            lastMousePosition = { x: e.clientX, y: e.clientY };
            draw();
            return;
        }

        worldMousePosition = getTransformedPoint(e.clientX, e.clientY);

        if (isConnecting) {
            draw();
        } else if (draggingNode) {
            draggingNode.x = worldMousePosition.x - dragOffsetX;
            draggingNode.y = worldMousePosition.y - dragOffsetY;
            draw();
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
            return;
        }

        if (draggingNode) {
            draggingNode.x = Math.round(draggingNode.x / GRID_SIZE) * GRID_SIZE;
            draggingNode.y = Math.round(draggingNode.y / GRID_SIZE) * GRID_SIZE;
        }

        if (isConnecting) {
            const endConnectorInfo = getConnectorAtPoint(worldMousePosition.x, worldMousePosition.y);
            if (endConnectorInfo && endConnectorInfo.connector.isInput && endConnectorInfo.node.id !== connectionStart.node.id) {
                const alreadyConnected = connections.some(conn => conn.to.nodeId === endConnectorInfo.node.id && conn.to.connectorId === endConnectorInfo.connector.id);
                if (!alreadyConnected) {
                     connections.push({
                        from: { nodeId: connectionStart.node.id, connectorId: connectionStart.connector.id },
                        to: { nodeId: endConnectorInfo.node.id, connectorId: endConnectorInfo.connector.id },
                    });
                }
            }
        }

        isConnecting = false;
        connectionStart = { node: null, connector: null };
        draggingNode = null;
        draw();
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);
        const newScale = Math.max(0.2, Math.min(3, scale * zoom));
        const worldPosBeforeZoom = getTransformedPoint(e.clientX, e.clientY);
        panOffset.x = e.clientX - worldPosBeforeZoom.x * newScale;
        panOffset.y = e.clientY - worldPosBeforeZoom.y * newScale;
        scale = newScale;
        draw();
    });

    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
            nodes = nodes.filter(node => node.id !== selectedNodeId);
            connections = connections.filter(conn => conn.from.nodeId !== selectedNodeId && conn.to.nodeId !== selectedNodeId);
            selectedNodeId = null;
            updatePropertiesPanel();
            draw();
        }
    });

    // Initial setup
    updatePropertiesPanel();
    resizeCanvas();
    loadWorkflow();
});
