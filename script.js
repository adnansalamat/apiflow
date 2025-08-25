document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const sidebar = document.getElementById('sidebar');
    const canvasContainer = document.getElementById('canvas-container');
    const propertiesPanel = document.getElementById('properties-panel');

    const style = getComputedStyle(document.documentElement);
    const nodeColors = {
        bodyBg: style.getPropertyValue('--node-body-bg'),
        text: style.getPropertyValue('--node-text-color'),
        border: style.getPropertyValue('--node-border-color'),
        selected: style.getPropertyValue('--node-selected-color'),
        header: {
            default: style.getPropertyValue('--node-header-bg'),
            start: style.getPropertyValue('--node-start-header-bg'),
            simple: style.getPropertyValue('--node-simple-header-bg'),
        }
    };

    let nodes = [];
    let connections = [];
    let draggingNode = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let selectedNodeId = null;

    let isConnecting = false;
    let connectionStart = { node: null, connector: null };
    let mousePosition = { x: 0, y: 0 };

    const connectorRadius = 8;
    const nodeWidth = 160;
    const nodeHeight = 60;
    const headerHeight = 24;

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
    resizeCanvas();

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        connections.forEach(conn => {
            const fromNode = nodes.find(n => n.id === conn.from.nodeId);
            const toNode = nodes.find(n => n.id === conn.to.nodeId);
            if (fromNode && toNode) {
                ctx.beginPath();
                const fromPos = getConnectorPosition(fromNode, fromNode.outputs[0]);
                const toPos = getConnectorPosition(toNode, toNode.inputs[0]);
                ctx.moveTo(fromPos.x, fromPos.y);
                ctx.lineTo(toPos.x, toPos.y);
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        });
        if (isConnecting && connectionStart.node) {
            ctx.beginPath();
            const startPos = getConnectorPosition(connectionStart.node, connectionStart.connector);
            ctx.moveTo(startPos.x, startPos.y);
            ctx.lineTo(mousePosition.x, mousePosition.y);
            ctx.strokeStyle = '#777';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        nodes.forEach(node => {
            ctx.fillStyle = nodeColors.bodyBg;
            ctx.fillRect(node.x, node.y, node.width, node.height);
            ctx.fillStyle = nodeColors.header[node.type] || nodeColors.header.default;
            ctx.fillRect(node.x, node.y, node.width, headerHeight);
            ctx.strokeStyle = (node.id === selectedNodeId) ? nodeColors.selected : nodeColors.border;
            ctx.lineWidth = (node.id === selectedNodeId) ? 3 : 1;
            ctx.strokeRect(node.x, node.y, node.width, node.height);
            ctx.fillStyle = nodeColors.text;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(node.properties.name, node.x + node.width / 2, node.y + headerHeight / 2 + 5);
            ctx.textAlign = 'left';
            [...node.inputs, ...node.outputs].forEach(connector => {
                const pos = getConnectorPosition(node, connector);
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, connectorRadius, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 1;
                ctx.stroke();
            });
        });
    }

    function updatePropertiesPanel() {
        if (selectedNodeId) {
            const node = nodes.find(n => n.id === selectedNodeId);
            if (node) {
                propertiesPanel.classList.add('visible');
                propertiesPanel.innerHTML = `
                    <h3>${node.type} Node</h3>
                    <div class="property">
                        <label for="prop-name">Name</label>
                        <input type="text" id="prop-name" value="${node.properties.name}">
                    </div>
                    <div class="property">
                        <label>Node ID</label>
                        <input type="text" value="${node.id}" readonly>
                    </div>
                `;
            }
        } else {
            propertiesPanel.classList.remove('visible');
            propertiesPanel.innerHTML = '<p>No node selected</p>';
        }
    }

    propertiesPanel.addEventListener('input', (e) => {
        if (e.target.id === 'prop-name' && selectedNodeId) {
            const node = nodes.find(n => n.id === selectedNodeId);
            if (node) {
                node.properties.name = e.target.value;
                draw(); // Redraw canvas to show new name on node
            }
        }
    });

    function getConnectorAtPoint(x, y) {
        for (const node of nodes) {
            for (const connector of [...node.inputs, ...node.outputs]) {
                const pos = getConnectorPosition(node, connector);
                const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
                if (dist < connectorRadius) {
                    return { node, connector };
                }
            }
        }
        return null;
    }

    function getNodeAtPoint(x, y) {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (x > node.x && x < node.x + node.width && y > node.y && y < node.y + node.height) {
                return node;
            }
        }
        return null;
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
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - nodeWidth / 2;
        const y = e.clientY - rect.top - nodeHeight / 2;

        const newNode = {
            id: Date.now(),
            type: nodeType,
            x: x,
            y: y,
            width: nodeWidth,
            height: nodeHeight,
            inputs: nodeType !== 'start' ? [{ id: 'input_1', type: 'input' }] : [],
            outputs: [{ id: 'output_1', type: 'output' }],
            properties: {
                name: nodeType.charAt(0).toUpperCase() + nodeType.slice(1) + ' Node',
            },
        };
        nodes.push(newNode);
        draw();
    });

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const connectorInfo = getConnectorAtPoint(mouseX, mouseY);
        if (connectorInfo && connectorInfo.connector.type === 'output') {
            isConnecting = true;
            connectionStart = connectorInfo;
            selectedNodeId = null;
            updatePropertiesPanel();
            draw();
            return;
        }

        const clickedNode = getNodeAtPoint(mouseX, mouseY);
        if (clickedNode) {
            draggingNode = clickedNode;
            dragOffsetX = mouseX - clickedNode.x;
            dragOffsetY = mouseY - clickedNode.y;
            selectedNodeId = clickedNode.id;
        } else {
            selectedNodeId = null;
        }
        updatePropertiesPanel();
        draw();
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mousePosition.x = e.clientX - rect.left;
        mousePosition.y = e.clientY - rect.top;

        if (isConnecting) {
            draw();
        } else if (draggingNode) {
            draggingNode.x = mousePosition.x - dragOffsetX;
            draggingNode.y = mousePosition.y - dragOffsetY;
            draw();
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isConnecting) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const endConnectorInfo = getConnectorAtPoint(mouseX, mouseY);

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

    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
            nodes = nodes.filter(node => node.id !== selectedNodeId);
            connections = connections.filter(conn => conn.from.nodeId !== selectedNodeId && conn.to.nodeId !== selectedNodeId);
            selectedNodeId = null;
            updatePropertiesPanel();
            draw();
        }
    });
});
