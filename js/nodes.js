// js/nodes.js

export const nodeTypes = {
    START: 'start',
    SIMPLE: 'simple',
    HTTP: 'http',
    BRANCH: 'branch',
    MERGE: 'merge',
    SET: 'set',
    FUNCTION: 'function',
    SWITCH: 'switch',
};

export function createNewNode(x, y, type) {
    const baseNode = {
        id: Date.now(),
        type,
        x: x - 90, // nodeWidth / 2
        y: y - 30, // nodeHeight / 2
        width: 180,
        height: 60,
        properties: [],
        outputData: null,
        status: 'idle'
    };

    switch (type) {
        case nodeTypes.START:
            baseNode.inputs = [];
            baseNode.outputs = [{ id: 'output_1', isInput: false, label: 'Out' }];
            baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Start' });
            break;
        case nodeTypes.SIMPLE:
            baseNode.inputs = [{ id: 'input_1', isInput: true }];
            baseNode.outputs = [{ id: 'output_1', isInput: false }];
            baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Simple Node' });
            break;
        case nodeTypes.HTTP:
            baseNode.inputs = [{ id: 'input_1', isInput: true }];
            baseNode.outputs = [{ id: 'output_1', isInput: false }];
            baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'HTTP Request' });
            baseNode.properties.push({ name: 'method', label: 'Method', type: 'select', value: 'GET', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
            baseNode.properties.push({ name: 'url', label: 'URL', type: 'textarea', value: 'https://jsonplaceholder.typicode.com/todos/1' });
            baseNode.properties.push({ name: 'headers', label: 'Headers', type: 'keyvalue', value: [{ key: 'Content-Type', value: 'application/json' }] });
            baseNode.properties.push({ name: 'body', label: 'JSON Body', type: 'json', value: '{\n  "key": "value"\n}' });
            baseNode.properties.push({ name: 'useProxy', label: 'Use CORS Proxy', type: 'checkbox', value: false });
            break;
        case nodeTypes.BRANCH:
            baseNode.inputs = [{ id: 'input_1', isInput: true }];
            baseNode.outputs = [{ id: 'output_true', isInput: false, label: 'True' }, { id: 'output_false', isInput: false, label: 'False' }];
            baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'IF Condition' });
            baseNode.properties.push({ name: 'path', label: 'Property Path', type: 'text', value: 'user.id' });
            baseNode.properties.push({ name: 'comparison', label: 'Comparison', type: 'select', value: 'equals', options: ['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan'] });
            baseNode.properties.push({ name: 'value', label: 'Value', type: 'text', value: '1' });
            break;
        case nodeTypes.MERGE:
            baseNode.inputs = [{ id: 'input_1', isInput: true }, { id: 'input_2', isInput: true }];
            baseNode.outputs = [{ id: 'output_1', isInput: false }];
            baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Merge' });
            break;
        case nodeTypes.SET:
            baseNode.inputs = [{ id: 'input_1', isInput: true }];
            baseNode.outputs = [{ id: 'output_1', isInput: false }];
            baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Set' });
            baseNode.properties.push({ name: 'keyvalue', label: 'Set Values', type: 'keyvalue', value: [{ key: 'newProperty', value: 'some value' }] });
            break;
        case nodeTypes.FUNCTION:
            baseNode.inputs = [{ id: 'input_1', isInput: true }];
            baseNode.outputs = [{ id: 'output_1', isInput: false }];
            baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Function' });
            baseNode.properties.push({ name: 'function', label: 'JavaScript Function', type: 'textarea', value: 'return { ...input, processedByFunction: true };' });
            break;
        case nodeTypes.SWITCH:
            baseNode.inputs = [{ id: 'input_1', isInput: true }];
            baseNode.outputs = [{ id: 'output_0', isInput: false, label: 'Case 1' }, { id: 'output_default', isInput: false, label: 'Default' }];
            baseNode.properties.push({ name: 'name', label: 'Name', type: 'text', value: 'Switch' });
            baseNode.properties.push({ name: 'path', label: 'Property Path', type: 'text', value: 'user.id' });
            baseNode.properties.push({ name: 'rules', label: 'Rules', type: 'rules', value: [{ comparison: 'equals', value: '1' }] });
            break;
    }
    return baseNode;
}
