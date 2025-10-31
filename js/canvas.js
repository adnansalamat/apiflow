// js/canvas.js

import { nodeIcons } from './ui.js';

const GRID_SIZE = 20;
const HEADER_HEIGHT = 28;

function drawGrid(ctx, panOffset, scale, canvasWidth, canvasHeight) {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1 / scale;
    const left = -panOffset.x / scale;
    const top = -panOffset.y / scale;
    const right = (canvasWidth - panOffset.x) / scale;
    const bottom = (canvasHeight - panOffset.y) / scale;
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

function drawNodeBody(ctx, node, borderColor, scale, nodeColors) {
    const cornerRadius = 5;
    ctx.beginPath();
    ctx.moveTo(node.x + cornerRadius, node.y);
    ctx.lineTo(node.x + node.width - cornerRadius, node.y);
    ctx.quadraticCurveTo(node.x + node.width, node.y, node.x + node.width, node.y + cornerRadius);
    ctx.lineTo(node.x + node.width, node.y + node.height - cornerRadius);
    ctx.quadraticCurveTo(node.x + node.width, node.y + node.height, node.x + node.width - cornerRadius, node.y + node.height);
    ctx.lineTo(node.x + cornerRadius, node.y + node.height);
    ctx.quadraticCurveTo(node.x, node.y + node.height, node.x, node.y + node.height - cornerRadius);
    ctx.lineTo(node.x, node.y + cornerRadius);
    ctx.quadraticCurveTo(node.x, node.y, node.x + cornerRadius, node.y);
    ctx.closePath();

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = nodeColors.bodyBg;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = (borderColor !== nodeColors.border ? 2 : 1) / scale;
    ctx.stroke();
}

export function draw(ctx, state) {
    const { nodes, connections, panOffset, scale, isConnecting, connectionStart, worldMousePosition, executingNodeIds, selectedNodeId, nodeColors } = state;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(scale, scale);

    drawGrid(ctx, panOffset, scale, ctx.canvas.width, ctx.canvas.height);

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
                const cp1x = fromPos.x + (toPos.x - fromPos.x) * 0.5;
                const cp1y = fromPos.y;
                const cp2x = fromPos.x + (toPos.x - fromPos.x) * 0.5;
                const cp2y = toPos.y;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toPos.x, toPos.y);
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
        let borderColor = nodeColors.border;
        if (node.status === 'failed') borderColor = nodeColors.failed;
        else if (node.status === 'success') borderColor = nodeColors.success;

        if (executingNodeIds.includes(node.id)) borderColor = nodeColors.executing;
        else if (node.id === selectedNodeId) borderColor = nodeColors.selected;

        drawNodeBody(ctx, node, borderColor, scale, nodeColors);

        ctx.fillStyle = nodeColors.header[node.type] || nodeColors.header.default;
        const cornerRadius = 5;
        ctx.beginPath();
        ctx.moveTo(node.x + cornerRadius, node.y);
        ctx.lineTo(node.x + node.width - cornerRadius, node.y);
        ctx.quadraticCurveTo(node.x + node.width, node.y, node.x + node.width, node.y + cornerRadius);
        ctx.lineTo(node.x + node.width, node.y + HEADER_HEIGHT);
        ctx.lineTo(node.x, node.y + HEADER_HEIGHT);
        ctx.lineTo(node.x, node.y + cornerRadius);
        ctx.quadraticCurveTo(node.x, node.y, node.x + cornerRadius, node.y);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = nodeColors.text;
        ctx.font = `bold ${14 / scale}px sans-serif`;
        ctx.textAlign = 'left';
        const displayName = node.properties.find(p => p.name === 'name')?.value || node.type;

        ctx.font = `${16 / scale}px "Font Awesome 6 Free"`;
        ctx.fillText(nodeIcons[node.type], node.x + 10, node.y + HEADER_HEIGHT / 2 + 5);

        ctx.font = `bold ${12 / scale}px sans-serif`;
        ctx.fillText(displayName, node.x + 35, node.y + HEADER_HEIGHT / 2 + 4);

        [...node.inputs, ...node.outputs].forEach(connector => {
            const pos = getConnectorPosition(node, connector);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 8 / scale, 0, 2 * Math.PI);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1 / scale;
            ctx.stroke();

            if (connector.label) {
                ctx.fillStyle = '#555';
                ctx.font = `${11/scale}px sans-serif`;
                const xOffset = connector.isInput ? 15 : -15;
                ctx.textAlign = connector.isInput ? 'left' : 'right';
                ctx.fillText(connector.label, pos.x + xOffset, pos.y + 4);
            }
        });
        ctx.textAlign = 'left';
    });

    ctx.restore();
}

export function getConnectorPosition(node, connector) {
    const connectorList = connector.isInput ? node.inputs : node.outputs;
    const index = connectorList.findIndex(c => c.id === connector.id);
    const count = connectorList.length;
    const x = node.x + (connector.isInput ? 0 : node.width);
    const y = node.y + HEADER_HEIGHT + ((node.height - HEADER_HEIGHT) * (index + 0.5) / count);
    return { x, y };
}
