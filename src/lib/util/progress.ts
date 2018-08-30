import {BackendCalls, BackendConfig, BackendToolsProvider} from '@/types';
import {getLogger} from '@/lib/util/logger';
import cliProgress from 'cli-progress';
import colors from 'colors';
import {Transform, TransformCallback} from 'stream';

export type ProgressContolToken = {
    toggleBypass?: (bypassOn: boolean) => void,
    terminate?: () => void,
    toggleVisibility?: (shouldBeVisibe: boolean) => void,
}

let progressBlocked = false;

export class ProgressStream extends Transform {
    protected progress: cliProgress.Bar;
    protected haveTotal: boolean;
    protected state: StreamState;
    completed: number;

    constructor(options: {}, title: string, private controlToken: ProgressContolToken, private total?: number) {
        super(options);

        this.state = StreamState.preparing;

        this.haveTotal = typeof this.total === 'number';

        const progressWithTotal = rigthPad(2000, `  ${colors.green(title)} [{bar}]  `
            + `${colors.gray('{_value} / {_total} Mb')}   {percentage}%   {duration_formatted}`);

        const progressWithoutTotal = rigthPad(2000, `  ${colors.green(title)} ${colors.gray(' {_value} Mb')}` +
            `   {duration_formatted}`);

        this.progress = new cliProgress.Bar({
            format: this.haveTotal ? progressWithTotal : progressWithoutTotal,
            barsize: 40,
            etaBuffer: 50,
            hideCursor: false,
            clearOnComplete: true,
            linewrap: false,
            fps: 50,
        });

        this.completed = 0;

        this.once('end', () => {
            this.die();
        });

        this.on('pipe', () => {
            if (this.state !== StreamState.bypass && this.state !== StreamState.visible) {
                this.state = StreamState.connected;
            }
        });

        this.on('unpipe', () => {
            if (this.state !== StreamState.bypass) {
                this.toggleVisibility(false);
                this.state = StreamState.preparing;
            }
        });

        this.controlToken.toggleVisibility = (shouldBeVisibe) => this.toggleVisibility(shouldBeVisibe);
        this.controlToken.toggleBypass = (shouldBeVisibe) => this.toggleBypass(shouldBeVisibe);
        this.controlToken.terminate = () => this.die();
    }

    toggleVisibility(shouldBeVisibe: boolean) {
        if (shouldBeVisibe && (this.state in [StreamState.connected, StreamState.hidden]) && !progressBlocked) {
            this.show();
            this.state = StreamState.visible;
            return;
        } else if (shouldBeVisibe && this.state === StreamState.preparing) {
            setTimeout(() => this.toggleVisibility(true), 1000);
        } else if (!shouldBeVisibe && this.state === StreamState.visible) {
            this.hide();
            this.state = StreamState.hidden;
            return;
        }
    }

    toggleBypass(bypassOn: boolean) {
        if (bypassOn && (this.state in [StreamState.connected, StreamState.hidden, StreamState.visible])) {
            this.state = StreamState.bypass;
            return;
        } else if (!bypassOn && this.state === StreamState.bypass) {
            this.state = StreamState.hidden;
            return;
        }
    }


    _transform(data: any, _encoding: string, callback: TransformCallback) {
        if (this.state !== StreamState.bypass) {
            this.completed += data.length;

            if (this.state === StreamState.visible && !progressBlocked) {
                const total = typeof this.total === 'number' ? this.total : 1000;

                this.progress.setTotal(total);
                this.progress.update(this.completed, {
                    _value: formatMb(this.completed),
                    _total: formatMb(total),
                });
            }
        }

        callback(undefined, data);
    }

    private show() {
        this.progress.start(typeof this.total === 'number' ? this.total : 1000, this.completed);
    }

    private hide() {
        this.progress.stop();
    }

    die() {
        if (this.state === StreamState.terminated) {
            return;
        }

        this.progress.stop();
        this.state = StreamState.terminated;
    }
}

enum StreamState {
    preparing,
    connected,
    visible,
    hidden,
    bypass,
    terminated,
}

function roundMb(bytes: number): number {
    return Math.floor((bytes / 1024 / 1024) * 100) / 100
}

function formatMb(bytes: number): string {
    return leftPad(7, roundMb(bytes).toFixed(2));
}

function leftPad(width: number, str: string): string {
    // https://stackoverflow.com/questions/5366849/convert-1-to-0001-in-javascript
    // @ts-ignore
    return Array(width).join(' ').substring(' ', width - str.length) + str;
}

function rigthPad(width: number, str: string): string {
    // https://stackoverflow.com/questions/5366849/convert-1-to-0001-in-javascript
    // @ts-ignore
    return str + Array(width).join(' ').substring(' ', width - str.length);
}

const allTokens: ProgressContolToken[] = [];

export function provideBackendCallTools(backendConfig: BackendConfig, callType: BackendCalls): BackendToolsProvider {
    const controlToken = {};
    allTokens.push(controlToken);

    return {
        getLogger() {
            return getLogger();
        },

        getProgressStream(label?: string, total?: number) {
            const resultLabel = label ? `${backendConfig.alias} ${label}` : `${backendConfig.alias} ${callType}`;
            return new ProgressStream({}, resultLabel, controlToken, total);
        },
    };
}

export function blockAllProgress(shouldBeBlocked: boolean) {
    progressBlocked = shouldBeBlocked;

    for (const token of allTokens) {
        if (token.toggleVisibility) {
            token.toggleVisibility(!shouldBeBlocked);
        }
    }
}
