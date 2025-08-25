document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const sidebar = document.getElementById('sidebar');
    const canvasContainer = document.getElementById('canvas-container');

    let nodes = [];
    let connections = [];
    let draggingNode = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function resizeCanvas() {
        canvas.width = canvasContainer.offsetWidth;
        canvas.height = canvasContainer.offsetHeight;
        draw();
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw connections
        connections.forEach(conn => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (fromNode && toNode) {
                ctx.beginPath();
                ctx.moveTo(fromNode.x + fromNode.width / 2, fromNode.y + fromNode.height / 2);
                ctx.lineTo(toNode.x + toNode.width / 2, toNode.y + toNode.height / 2);
                ctx.stroke();
            }
        });

        // Draw nodes
        nodes.forEach(node => {
            ctx.fillStyle = 'lightblue';
            ctx.fillRect(node.x, node.y, node.width, node.height);
            ctx.fillStyle = 'black';
            ctx.fillText(node.type, node.x + 10, node.y + 20);
        });
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
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const newNode = {
            id: Date.now(),
            type: nodeType,
            x: x,
            y: y,
            width: 150,
            height: 50,
        };
        nodes.push(newNode);
        draw();
    });

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (mouseX > node.x && mouseX < node.x + node.width &&
                mouseY > node.y && mouseY < node.y + node.height) {
                draggingNode = node;
                dragOffsetX = mouseX - node.x;
                dragOffsetY = mouseY - node.y;
                break;
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (draggingNode) {
            const rect = canvas.getBoundingClientRect();
            draggingNode.x = e.clientX - rect.left - dragOffsetX;
            draggingNode.y = e.clientY - rect.top - dragOffsetY;
            draw();
        }
    });

    canvas.addEventListener('mouseup', () => {
        draggingNode = null;
    });

    canvas.addEventListener('mouseleave', () => {
        draggingNode = null;
    });
});
