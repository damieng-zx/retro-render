
async function getPlainText(uri: string): Promise<string> {
    const response = await fetch(uri, {
        headers: new Headers({ 'Accept': 'text/plain' })
    });

    if (!response.ok)
        throw new Error(`Unable to fetch ${uri}: ${response.status} ${response.statusText}`);

    return response.text();
}

async function getBinary(uri: string): Promise<ArrayBuffer> {
    const response = await fetch(uri, {
        headers: new Headers({ 'Accept': 'application/octet-stream' })
    });

    if (!response.ok)
        throw new Error(`Unable to fetch ${uri}: ${response.status} ${response.statusText}`);

    return response.arrayBuffer();
}

function createText(tag: string, text?: string): Node {
    if (tag === '')
        return document.createTextNode(text ?? '');

    const element = document.createElement(tag);
    if (text)
        element.innerText = text;

    return element;
}
