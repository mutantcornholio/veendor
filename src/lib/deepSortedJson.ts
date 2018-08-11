/**
 * returns sorted array of object contents
 * see deepSortedJson.test.js for examples
 * @param {Object} jsonObject
 * @returns {string[]}
 */

type JSONValue = string | number | boolean | JSONObject | JSONArray;

interface JSONObject {
    [x: string]: JSONValue;
}

interface JSONArray extends Array<JSONValue> {}

function isJSONObject(obj: JSONValue): obj is JSONObject {
    return obj !== null && typeof obj === 'object';
}

function deepSortedJson(jsonObject: JSONObject): string[] {
    const tmpObj = {...jsonObject};
    const result = [];

    while (true) {
        const tmpObjkeys = Object.keys(tmpObj);

        if (tmpObjkeys.length === 0) {
            break;
        }

        for (const i of tmpObjkeys) {
            const val: JSONValue = tmpObj[i];

            if (val instanceof Array) {
                for (const [index, value] of val.entries()) {
                    tmpObj[`${i}[${index}]`] = value;
                }
            } else if (isJSONObject(val)) {
                const keys = Object.keys(val);

                if (keys.length === 0) {
                    result.push(`${i}`);
                } else {
                    for (const key of keys) {
                        tmpObj[`${i}.${key}`] = val[key];
                    }
                }
            } else {
                result.push(`${i}=${val}`);
            }

            delete tmpObj[i];
        }
    }

    return result.sort();
}

export {deepSortedJson as transform};
