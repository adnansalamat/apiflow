// script.js

import { createNewNode } from './js/nodes.js';
import { draw, getConnectorPosition } from './js/canvas.js';
import { updatePropertiesPanel } from './js/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const sidebar = document.getElementById('sidebar');
    const canvasContainer = document.getElementById('canvas-container');
    const saveBtn = document.getElementById('save-btn');
    const loadBtn = document.getElementById('load-btn');
    const runBtn = document.getElementById('run-btn');
    const propertiesPanel = document.getElementById('properties-panel');

    const CORS_PROXY_URL = 'https://corsproxy.io/?';

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
            set: style.getPropertyValue('--node-set-header-bg'),
            function: style.getPropertyValue('--node-function-header-bg'),
            switch: style.getPropertyValue('--node-switch-header-bg'),
        }
    };

    let state = {
        nodes: [],
        connections: [],
        draggingNode: null,
        dragOffsetX: 0,
        dragOffsetY: 0,
        selectedNodeId: null,
        executingNodeIds: [],
        isConnecting: false,
        connectionStart: { node: null, connector: null },
        scale: 1,
        panOffset: { x: 0, y: 0 },
        isPanning: false,
        lastMousePosition: { x: 0, y: 0 },
        worldMousePosition: { x: 0, y: 0 },
        nodeColors: nodeColors
    };

    function saveWorkflow() {
        const { nodes, connections, panOffset, scale } = state;
        const workflow = { nodes, connections, panOffset, scale };
        localStorage.setItem('n8n-clone-workflow', JSON.stringify(workflow));
        alert('Workflow saved!');
    }

    function loadWorkflow() {
        const savedWorkflow = localStorage.getItem('n8n-clone-workflow');
        if (savedWorkflow) {
            const workflow = JSON.parse(savedWorkflow);
            state.nodes = workflow.nodes;
            state.nodes.forEach(node => {
                if (node.outputData === undefined) node.outputData = null;
                if (node.status === undefined) node.status = 'idle';
            });
            state.connections = workflow.connections;
            state.panOffset = workflow.panOffset || { x: 0, y: 0 };
            state.scale = workflow.scale || 1;
            state.selectedNodeId = null;
            updatePropertiesPanel(state.nodes, state.selectedNodeId);
            draw(ctx, state);
        }
    }

    function getValueFromPath(obj, path) {
        if (!path) return undefined;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    function setValueFromPath(obj, path, value) {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }

    function resolveTemplates(templateString, data) {
        if (typeof templateString !== 'string') return templateString;
        return templateString.replace(/{{\s*([^}]+)\s*}}/g, (match, path) => {
            const value = getValueFromPath(data, path.trim());
            return value !== undefined ? value : '';
        });
    }

    async function executeNode(node, inputData) {
        let outputData = JSON.parse(JSON.stringify(inputData));
        try {
            if (node.type === 'start') {
                outputData = { user: { id: 1, name: "Leanne Graham" }, message: "Workflow started" };
            } else if (node.type === 'simple') {
                outputData.processedBy = 'Simple Node';
                outputData.timestamp = new Date().toISOString();
            } else if (node.type === 'http') {
                const urlProp = node.properties.find(p => p.name === 'url');
                const methodProp = node.properties.find(p => p.name === 'method');
                const headersProp = node.properties.find(p => p.name === 'headers');
                const bodyProp = node.properties.find(p => p.name === 'body');
                const useProxyProp = node.properties.find(p => p.name === 'useProxy');
                let targetUrl = resolveTemplates(urlProp.value, inputData);
                if (useProxyProp.value) {
                    targetUrl = CORS_PROXY_URL + encodeURIComponent(targetUrl);
                }
                const fetchOptions = { method: methodProp.value, headers: {} };
                if (headersProp && headersProp.value.length > 0) {
                    headersProp.value.forEach(header => {
                        if (header.key) fetchOptions.headers[header.key] = resolveTemplates(header.value, inputData);
                    });
                }
                if (['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
                    try {
                        const resolvedBody = resolveTemplates(bodyProp.value, inputData);
                        fetchOptions.body = JSON.stringify(JSON.parse(resolvedBody));
                        if (!fetchOptions.headers['Content-Type']) {
                            fetchOptions.headers['Content-Type'] = 'application/json';
                        }
                    } catch (e) {
                        throw new Error(`Invalid JSON in request body: ${e.message}`);
                    }
                }
                const response = await fetch(targetUrl, fetchOptions);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const responseText = await response.text();
                try {
                    outputData = JSON.parse(responseText);
                } catch (e) {
                    outputData = { response: responseText };
                }
            } else if (node.type === 'set') {
                const kvProp = node.properties.find(p => p.name === 'keyvalue');
                kvProp.value.forEach(item => {
                    if (item.key) {
                        const resolvedValue = resolveTemplates(item.value, inputData);
                        setValueFromPath(outputData, item.key, resolvedValue);
                    }
                });
            } else if (node.type === 'function') {
                const funcProp = node.properties.find(p => p.name === 'function');
                const customFunc = new Function('input', funcProp.value);
                outputData = customFunc(inputData);
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
        state.executingNodeIds.push(node.id);
        draw(ctx, state);
        try {
            const outputData = await executeNode(node, inputData);
            if (node.id === state.selectedNodeId) updatePropertiesPanel(state.nodes, state.selectedNodeId);
            await new Promise(resolve => setTimeout(resolve, 500));
            state.executingNodeIds = state.executingNodeIds.filter(id => id !== node.id);
            draw(ctx, state);
            let outgoingConnections = state.connections.filter(c => c.from.nodeId === node.id);
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
            } else if (node.type === 'switch') {
                const pathProp = node.properties.find(p => p.name === 'path').value;
                const dataValue = getValueFromPath(outputData, pathProp);
                const rules = node.properties.find(p => p.name === 'rules').value;
                let matched = false;
                for (let i = 0; i < rules.length; i++) {
                    let rule = rules[i];
                    let conditionResult = false;
                    switch (rule.comparison) {
                        case 'equals': conditionResult = (String(dataValue) == rule.value); break;
                        case 'notEquals': conditionResult = (String(dataValue) != rule.value); break;
                        case 'contains': conditionResult = String(dataValue).includes(rule.value); break;
                        case 'greaterThan': conditionResult = (Number(dataValue) > Number(rule.value)); break;
                        case 'lessThan': conditionResult = (Number(dataValue) < Number(rule.value)); break;
                    }
                    if (conditionResult) {
                        outgoingConnections = outgoingConnections.filter(c => c.from.connectorId === `output_${i}`);
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    outgoingConnections = outgoingConnections.filter(c => c.from.connectorId === 'output_default');
                }
            }
            const nextTasks = outgoingConnections.map(conn => {
                const nextNode = state.nodes.find(n => n.id === conn.to.nodeId);
                return runFrom(nextNode, outputData);
            });
            await Promise.all(nextTasks);
        } catch (error) {
            state.executingNodeIds = state.executingNodeIds.filter(id => id !== node.id);
            if (node.id === state.selectedNodeId) updatePropertiesPanel(state.nodes, state.selectedNodeId);
            draw(ctx, state);
        }
    }

    async function executeWorkflow() {
        state.nodes.forEach(n => {
            n.outputData = null;
            n.status = 'idle';
        });
        draw(ctx, state);
        const startNode = state.nodes.find(n => n.type === 'start');
        if (!startNode) {
            alert('Cannot execute workflow without a Start node.');
            return;
        }
        runBtn.disabled = true;
        await runFrom(startNode, {});
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

    function resizeCanvas() {
        canvas.width = canvasContainer.offsetWidth;
        canvas.height = canvasContainer.offsetHeight;
        draw(ctx, state);
    }
    window.addEventListener('resize', resizeCanvas);

    sidebar.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('node-palette-item')) e.dataTransfer.setData('text/plain', e.target.dataset.nodeType);
    });

    canvasContainer.addEventListener('dragover', (e) => e.preventDefault());

    canvasContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('text/plain');
        const worldPos = getTransformedPoint(e.clientX, e.clientY);
        const newNode = createNewNode(worldPos.x, worldPos.y, nodeType);
        state.nodes.push(newNode);
        draw(ctx, state);
    });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
            state.isPanning = true;
            state.lastMousePosition = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }
        state.worldMousePosition = getTransformedPoint(e.clientX, e.clientY);
        const connectorInfo = getConnectorAtPoint(state.worldMousePosition.x, state.worldMousePosition.y);
        if (connectorInfo && !connectorInfo.connector.isInput) {
            state.isConnecting = true;
            state.connectionStart = connectorInfo;
            state.selectedNodeId = null;
            updatePropertiesPanel(state.nodes, state.selectedNodeId);
            draw(ctx, state);
            return;
        }
        const clickedNode = getNodeAtPoint(state.worldMousePosition.x, state.worldMousePosition.y);
        if (clickedNode) {
            state.draggingNode = clickedNode;
            state.dragOffsetX = state.worldMousePosition.x - clickedNode.x;
            state.dragOffsetY = state.worldMousePosition.y - clickedNode.y;
            state.selectedNodeId = clickedNode.id;
        } else {
            state.selectedNodeId = null;
        }
        updatePropertiesPanel(state.nodes, state.selectedNodeId);
        draw(ctx, state);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (state.isPanning) {
            const dx = e.clientX - state.lastMousePosition.x;
            const dy = e.clientY - state.lastMousePosition.y;
            state.panOffset.x += dx;
            state.panOffset.y += dy;
            state.lastMousePosition = { x: e.clientX, y: e.clientY };
            draw(ctx, state);
            return;
        }
        state.worldMousePosition = getTransformedPoint(e.clientX, e.clientY);
        if (state.isConnecting) {
            draw(ctx, state);
        } else if (state.draggingNode) {
            state.draggingNode.x = state.worldMousePosition.x - state.dragOffsetX;
            state.draggingNode.y = state.worldMousePosition.y - state.dragOffsetY;
            draw(ctx, state);
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (state.isPanning) {
            state.isPanning = false;
            canvas.style.cursor = 'default';
            return;
        }
        if (state.draggingNode) {
            state.draggingNode.x = Math.round(state.draggingNode.x / 20) * 20;
            state.draggingNode.y = Math.round(state.draggingNode.y / 20) * 20;
        }
        if (state.isConnecting) {
            const endConnectorInfo = getConnectorAtPoint(state.worldMousePosition.x, state.worldMousePosition.y);
            if (endConnectorInfo && endConnectorInfo.connector.isInput && endConnectorInfo.node.id !== state.connectionStart.node.id) {
                const alreadyConnected = state.connections.some(conn => conn.to.nodeId === endConnectorInfo.node.id && conn.to.connectorId === endConnectorInfo.connector.id);
                if (!alreadyConnected) {
                    state.connections.push({
                        from: { nodeId: state.connectionStart.node.id, connectorId: state.connectionStart.connector.id },
                        to: { nodeId: endConnectorInfo.node.id, connectorId: endConnectorInfo.connector.id },
                    });
                }
            }
        }
        state.isConnecting = false;
        state.connectionStart = { node: null, connector: null };
        state.draggingNode = null;
        draw(ctx, state);
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);
        const worldPosBeforeZoom = { x: (mouseX - state.panOffset.x) / state.scale, y: (mouseY - state.panOffset.y) / state.scale };
        const newScale = Math.max(0.2, Math.min(3, state.scale * zoom));
        state.panOffset.x = mouseX - worldPosBeforeZoom.x * newScale;
        state.panOffset.y = mouseY - worldPosBeforeZoom.y * newScale;
        state.scale = newScale;
        draw(ctx, state);
    });

    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedNodeId) {
            state.nodes = state.nodes.filter(node => node.id !== state.selectedNodeId);
            state.connections = state.connections.filter(conn => conn.from.nodeId !== state.selectedNodeId && conn.to.nodeId !== state.selectedNodeId);
            state.selectedNodeId = null;
            updatePropertiesPanel(state.nodes, state.selectedNodeId);
            draw(ctx, state);
        }
    });

    propertiesPanel.addEventListener('input', (e) => {
        const node = state.nodes.find(n => n.id === state.selectedNodeId);
        if (!node) return;
        const propName = e.target.dataset.name;
        if (!propName) return;
        const prop = node.properties.find(p => p.name === propName);
        if (!prop) return;

        if (prop.type === 'json') {
            try {
                JSON.parse(e.target.value);
                e.target.style.border = '1px solid #ddd';
            } catch (error) {
                e.target.style.border = '1px solid red';
            }
        }

        if (e.target.type === 'checkbox') {
            prop.value = e.target.checked;
        } else if (prop.type === 'keyvalue' || prop.type === 'rules') {
            const index = parseInt(e.target.dataset.index, 10);
            const part = e.target.dataset.part;
            prop.value[index][part] = e.target.value;
        } else {
            prop.value = e.target.value;
        }

        if (prop.name === 'name') draw(ctx, state);
        if (prop.name === 'method') updatePropertiesPanel(state.nodes, state.selectedNodeId);
    });

    propertiesPanel.addEventListener('click', (e) => {
        if (e.target.classList.contains('panel-tab-btn')) {
            const tabName = e.target.dataset.tab;
            propertiesPanel.querySelector('.panel-tab-btn.active').classList.remove('active');
            propertiesPanel.querySelector('.panel-tab-content.active').classList.remove('active');
            e.target.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        } else if (e.target.classList.contains('add-kv-btn')) {
            const node = state.nodes.find(n => n.id === state.selectedNodeId);
            const propName = e.target.dataset.name;
            const prop = node.properties.find(p => p.name === propName);
            prop.value.push({ key: '', value: '' });
            updatePropertiesPanel(state.nodes, state.selectedNodeId);
        } else if (e.target.classList.contains('remove-kv-btn')) {
            const node = state.nodes.find(n => n.id === state.selectedNodeId);
            const propName = e.target.dataset.name;
            const prop = node.properties.find(p => p.name === propName);
            const index = parseInt(e.target.dataset.index, 10);
            prop.value.splice(index, 1);
            updatePropertiesPanel(state.nodes, state.selectedNodeId);
        } else if (e.target.classList.contains('add-rule-btn')) {
            const node = state.nodes.find(n => n.id === state.selectedNodeId);
            const propName = e.target.dataset.name;
            const prop = node.properties.find(p => p.name === propName);
            prop.value.push({ comparison: 'equals', value: '' });
            node.outputs.splice(node.outputs.length - 1, 0, { id: `output_${prop.value.length-1}`, isInput: false, label: `Case ${prop.value.length}` });
            updatePropertiesPanel(state.nodes, state.selectedNodeId);
            draw(ctx, state);
        } else if (e.target.classList.contains('remove-rule-btn')) {
            const node = state.nodes.find(n => n.id === state.selectedNodeId);
            const propName = e.target.dataset.name;
            const prop = node.properties.find(p => p.name === propName);
            const index = parseInt(e.target.dataset.index, 10);
            prop.value.splice(index, 1);
            node.outputs.splice(index, 1);
            updatePropertiesPanel(state.nodes, state.selectedNodeId);
            draw(ctx, state);
        }
    });

    function getTransformedPoint(x, y) {
        const rect = canvas.getBoundingClientRect();
        const screenX = x - rect.left;
        const screenY = y - rect.top;
        return { x: (screenX - state.panOffset.x) / state.scale, y: (screenY - state.panOffset.y) / state.scale };
    }

    function getConnectorAtPoint(worldX, worldY) {
        for (const node of state.nodes) {
            for (const connector of [...node.inputs, ...node.outputs]) {
                const pos = getConnectorPosition(node, connector);
                const dist = Math.sqrt((pos.x - worldX) ** 2 + (pos.y - worldY) ** 2);
                if (dist < (8 / state.scale)) {
                    return { node, connector };
                }
            }
        }
        return null;
    }

    function getNodeAtPoint(worldX, worldY) {
        for (let i = state.nodes.length - 1; i >= 0; i--) {
            const node = state.nodes[i];
            if (worldX > node.x && worldX < node.x + node.width && worldY > node.y && worldY < node.y + node.height) {
                return node;
            }
        }
        return null;
    }

    updatePropertiesPanel(state.nodes, state.selectedNodeId);
    resizeCanvas();
    loadWorkflow();
});
