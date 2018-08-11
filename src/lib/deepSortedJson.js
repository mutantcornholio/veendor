/**
 * returns sorted array of object contents
 * see deepSortedJson.test.js for examples
 * @param {Object} jsonObject
 * @returns {string[]}
 */
function deepSortedJson(jsonObject) {
    const tmpObj = Object.create(null);
    const result = [];

    for (const i of Object.keys(jsonObject)) {
        tmpObj[i] = jsonObject[i];
    }

    while (true) {
        const tmpObjkeys = Object.keys(tmpObj);

        if (tmpObjkeys.length === 0) {
            break;
        }

        for (const i of tmpObjkeys) {
            if (tmpObj[i] instanceof Array) {
                for (const [index, value] of tmpObj[i].entries()) {
                    tmpObj[`${i}[${index}]`] = value;
                }
            } else if (tmpObj[i] !== null && typeof tmpObj[i] === 'object') {
                const keys = Object.keys(tmpObj[i]);
                if (keys.length === 0) {
                    result.push(`${i}`);
                } else {
                    for (const key of keys) {
                        tmpObj[`${i}.${key}`] = tmpObj[i][key];
                    }
                }
            } else {
                result.push(`${i}=${tmpObj[i]}`);
            }

            delete tmpObj[i];
        }
    }

    return result.sort();
}

// exporting as object to ease mocking in tests
module.exports = {
    transform: deepSortedJson,
};
