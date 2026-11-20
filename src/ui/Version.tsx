import type { ReactElement } from 'react';
import { RULES_VERSION } from '../engine';
import { APP_VERSION, BUILD, BUILD_DATE } from '../version';
import { T } from './text';

/** The one version string, shown on Home and in the match Menu: version, build, rules, build day. */
export function versionLine(): string {
  return `${T.ui.versionWord} ${APP_VERSION} (${BUILD}), ${T.ui.rulesWord} ${RULES_VERSION}, ${T.ui.builtWord} ${BUILD_DATE}`;
}

export function Version({ as }: { as: 'footer' | 'p' }): ReactElement {
  return as === 'footer' ? <footer className="version">{versionLine()}</footer> : <p className="version">{versionLine()}</p>;
}
