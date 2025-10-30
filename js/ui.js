// js/ui.js

export const nodeIcons = {
    start: '\uf144',
    simple: '\uf1b2',
    http: '\uf0ac',
    branch: '\uf126',
    merge: '\uf066',
    set: '\uf044',
    function: '\uf121',
    switch: '\uf362'
};

export function updatePropertiesPanel(nodes, selectedNodeId) {
    const propertiesPanel = document.getElementById('properties-panel');
    const node = nodes.find(n => n.id === selectedNodeId);
    const propertiesTab = document.getElementById('properties-tab');
    const dataTab = document.getElementById('data-tab');

    if (node) {
        propertiesPanel.classList.add('visible');
        let propertiesContent = `<h3>${node.type} Node</h3>`;
        const methodProp = node.properties.find(p => p.name === 'method');
        const showBody = node.type === 'http' && ['POST', 'PUT', 'PATCH'].includes(methodProp?.value);
        node.properties.forEach(prop => {
            const isBodyAndHidden = prop.name === 'body' && !showBody;
            if (isBodyAndHidden) return;
            propertiesContent += `<div class="property">`;
            if (prop.type === 'checkbox') {
                propertiesContent += `<label><input type="checkbox" data-name="${prop.name}" ${prop.value ? 'checked' : ''}> ${prop.label}</label>`;
            } else if (prop.type === 'keyvalue') {
                propertiesContent += `<label>${prop.label}</label>`;
                prop.value.forEach((item, index) => {
                    propertiesContent += `
                        <div class="kv-pair">
                            <input type="text" placeholder="Key" data-name="${prop.name}" data-index="${index}" data-part="key" value="${item.key}">
                            <input type="text" placeholder="Value" data-name="${prop.name}" data-index="${index}" data-part="value" value="${item.value}">
                            <button class="remove-kv-btn" data-name="${prop.name}" data-index="${index}">-</button>
                        </div>
                    `;
                });
                propertiesContent += `<button class="add-kv-btn" data-name="${prop.name}">+ Add</button>`;
            } else if (prop.type === 'rules') {
                propertiesContent += `<label>${prop.label}</label>`;
                prop.value.forEach((rule, index) => {
                    propertiesContent += `
                        <div class="rule-item">
                            <select data-name="${prop.name}" data-index="${index}" data-part="comparison">
                                <option value="equals" ${rule.comparison === 'equals' ? 'selected' : ''}>Equals</option>
                                <option value="notEquals" ${rule.comparison === 'notEquals' ? 'selected' : ''}>Not Equals</option>
                                <option value="contains" ${rule.comparison === 'contains' ? 'selected' : ''}>Contains</option>
                                <option value="greaterThan" ${rule.comparison === 'greaterThan' ? 'selected' : ''}>Greater Than</option>
                                <option value="lessThan" ${rule.comparison === 'lessThan' ? 'selected' : ''}>Less Than</option>
                            </select>
                            <input type="text" placeholder="Value" data-name="${prop.name}" data-index="${index}" data-part="value" value="${rule.value}">
                            <button class="remove-rule-btn" data-name="${prop.name}" data-index="${index}">-</button>
                        </div>
                    `;
                });
                propertiesContent += `<button class="add-rule-btn" data-name="${prop.name}">+ Add Rule</button>`;
            } else {
                propertiesContent += `<label for="prop-${prop.name}">${prop.label}</label>`;
                if (prop.type === 'json' || prop.type === 'textarea') {
                    propertiesContent += `<textarea id="prop-${prop.name}" data-name="${prop.name}" rows="5">${prop.value}</textarea>`;
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
