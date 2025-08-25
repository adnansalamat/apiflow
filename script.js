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

    const style = getComputedStyle(document.documentElement);
    const nodeColors = {
        bodyBg: style.getPropertyValue('--node-body-bg'),
        text: style.getPropertyValue('--node-text-color'),
        border: style.getPropertyValue('--node-border-color'),
        selected: style.getPropertyValue('--node-selected-color'),
        executing: 'lime',
        header: {
            default: style.getPropertyValue('--node-header-bg'),
            start: style.getPropertyValue('--node-start-header-bg'),
            simple: style.getPropertyValue('--node-simple-header-bg'),
            http: style.getPropertyValue('--node-http-header-bg'),
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
        const workflow = {
            nodes: nodes,
            connections: connections,
            panOffset: panOffset,
            scale: scale
        };
        localStorage.setItem('n8n-clone-workflow', JSON.stringify(workflow));
        console.log('Workflow saved!');
        alert('Workflow saved!');
    }

    function loadWorkflow() {
        const savedWorkflow = localStorage.getItem('n8n-clone-workflow');
        if (savedWorkflow) {
            const workflow = JSON.parse(savedWorkflow);
            nodes = workflow.nodes;
            connections = workflow.connections;
            panOffset = workflow.panOffset || { x: 0, y: 0 };
            scale = workflow.scale || 1;
            selectedNodeId = null;
            updatePropertiesPanel();
            draw();
            console.log('Workflow loaded!');
        }
    }

    async function executeWorkflow() {
        const startNode = nodes.find(n => n.type === 'start');
        if (!startNode) {
            alert('Cannot execute workflow without a Start node.');
            return;
        }

        runBtn.disabled = true;
        let executionPath = [];
        let currentNode = startNode;
        let visited = new Set();

        while(currentNode) {
            if (visited.has(currentNode.id)) {
                console.error("Cycle detected in workflow. Aborting.");
                alert("Execution failed: Cycle detected in workflow.");
                runBtn.disabled = false;
                return;
            }
            visited.add(currentNode.id);
            executionPath.push(currentNode);
            const connection = connections.find(c => c.from.nodeId === currentNode.id);
            currentNode = connection ? nodes.find(n => n.id === connection.to.nodeId) : null;
        }

        for (const node of executionPath) {
            const nodeName = node.properties.find(p => p.name === 'name').value;
            console.log(`%cExecuting node: ${nodeName}`, 'font-weight: bold; color: blue;');

            executingNodeIds.push(node.id);
            draw();

            if (node.type === 'http') {
                const urlProp = node.properties.find(p => p.name === 'url');
                const methodProp = node.properties.find(p => p.name === 'method');
                const useProxyProp = node.properties.find(p => p.name === 'useProxy');

                let targetUrl = urlProp.value;
                if (useProxyProp.value) {
                    targetUrl = CORS_PROXY_URL + encodeURIComponent(targetUrl);
                    console.log(`Using CORS proxy. Final URL: ${targetUrl}`);
                }

                try {
                    const response = await fetch(targetUrl, { method: methodProp.value });
                    console.log(`Response from ${nodeName}:`, response.status, response.statusText);
                    const data = await response.text();
                    console.log('Response data:', data.substring(0, 200) + '...'); // Log first 200 chars
                } catch (error) {
                    console.error(`Error executing ${nodeName}:`, error);
                }

            } else {
                // Generic execution for other nodes
                console.log('Properties:', node.properties);
            }

            await new Promise(resolve => setTimeout(resolve, 500));
            executingNodeIds = executingNodeIds.filter(id => id !== node.id);
            draw();
        }

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
        const x = node.x + (connector.type === 'input' ? 0 : node.width);
        const y = node.y + headerHeight + (node.height - headerHeight) / 2;
        return { x, y };
    }

    function resizeCanvas() {
        canvas.width = canvasContainer.offsetWidth;
        canvas.height = canvasContainer.offsetHeight;
        draw();
    }

    window.addEventListener('resize', resizeCanvas);

    function draw() {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        ctx.save();
        ctx.translate(panOffset.x, panOffset.y);
        ctx.scale(scale, scale);

        connections.forEach(conn => {
            ctx.beginPath();
            const fromNode = nodes.find(n => n.id === conn.from.nodeId);
            const toNode = nodes.find(n => n.id === conn.to.nodeId);
            if (fromNode && toNode) {
                const fromPos = getConnectorPosition(fromNode, fromNode.outputs[0]);
                const toPos = getConnectorPosition(toNode, toNode.inputs[0]);
                ctx.moveTo(fromPos.x, fromPos.y);
                ctx.lineTo(toPos.x, toPos.y);
            }
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2 / scale;
            ctx.stroke();
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
            if (executingNodeIds.includes(node.id)) {
                borderColor = nodeColors.executing;
            } else if (node.id === selectedNodeId) {
                borderColor = nodeColors.selected;
            }
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = ((executingNodeIds.includes(node.id) || node.id === selectedNodeId) ? 3 : 1) / scale;
            ctx.strokeRect(node.x, node.y, node.width, node.height);

            ctx.fillStyle = nodeColors.text;
            ctx.font = `${14 / scale}px sans-serif`;
            ctx.textAlign = 'center';
            const displayName = node.properties.find(p => p.name === 'name')?.value || node.type;
            ctx.fillText(displayName, node.x + node.width / 2, node.y + headerHeight / 2 + (5 / scale));
            ctx.textAlign = 'left';
            [...node.inputs, ...node.outputs].forEach(connector => {
                const pos = getConnectorPosition(node, connector);
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, connectorRadius / scale, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 1 / scale;
                ctx.stroke();
            });
        });

        ctx.restore();
    }

    function updatePropertiesPanel() {
        const node = nodes.find(n => n.id === selectedNodeId);
        if (node) {
            propertiesPanel.classList.add('visible');
            let content = `<h3>${node.type} Node</h3>`;

            node.properties.forEach(prop => {
                content += `<div class="property">`;

                if (prop.type === 'checkbox') {
                    content += `<label><input type="checkbox" data-name="${prop.name}" ${prop.value ? 'checked' : ''}> ${prop.label}</label>`;
                } else {
                    content += `<label for="prop-${prop.name}">${prop.label}</label>`;
                    if (prop.type === 'textarea') {
                        content += `<textarea id="prop-${prop.name}" data-name="${prop.name}" rows="3">${prop.value}</textarea>`;
                    } else if (prop.type === 'select') {
                        content += `<select id="prop-${prop.name}" data-name="${prop.name}">`;
                        prop.options.forEach(option => {
                            content += `<option value="${option}" ${option === prop.value ? 'selected' : ''}>${option}</option>`;
                        });
                        content += `</select>`;
                    } else {
                        content += `<input type="text" id="prop-${prop.name}" data-name="${prop.name}" value="${prop.value}">`;
                    }
                }
                content += `</div>`;
            });

            propertiesPanel.innerHTML = content;
        } else {
            propertiesPanel.classList.remove('visible');
            propertiesPanel.innerHTML = '<p>No node selected</p>';
        }
    }

    propertiesPanel.addEventListener('input', (e) => {
        const node = nodes.find(n => n.id === selectedNodeId);
        if (node && e.target.dataset.name) {
            const propName = e.target.dataset.name;
            const prop = node.properties.find(p => p.name === propName);
            if (prop) {
                if (e.target.type === 'checkbox') {
                    prop.value = e.target.checked;
                } else {
                    prop.value = e.target.value;
                }

                if (prop.name === 'name') {
                    draw();
                }
            }
        }
    });

    function getTransformedPoint(x, y) {
        const rect = canvas.getBoundingClientRect();
        const screenX = x - rect.left;
        const screenY = y - rect.top;
        return {
            x: (screenX - panOffset.x) / scale,
            y: (screenY - panOffset.y) / scale
        };
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
            inputs: type !== 'start' ? [{ id: 'input_1', type: 'input' }] : [],
            outputs: [{ id: 'output_1', type: 'output' }],
            properties: []
        };

        switch(type) {
            case 'start':
                baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Start' });
                break;
            case 'simple':
                baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Simple Node' });
                break;
            case 'http':
                 baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'HTTP Request' });
                 baseNode.properties.push({ name: 'method', label: 'Method', type: 'select', value: 'GET', options: ['GET', 'POST', 'PUT', 'DELETE'] });
                 baseNode.properties.push({ name: 'url', label: 'URL', type: 'textarea', value: 'https://example.com' });
                 baseNode.properties.push({ name: 'useProxy', label: 'Use CORS Proxy', type: 'checkbox', value: false });
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
        if (connectorInfo && connectorInfo.connector.type === 'output') {
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

        if (isConnecting) {
            const endConnectorInfo = getConnectorAtPoint(worldMousePosition.x, worldMousePosition.y);
            if (endConnectorInfo && endConnectorInfo.connector.type === 'input' && endConnectorInfo.node.id !== connectionStart.node.id) {
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

    resizeCanvas();
    loadWorkflow();
});
