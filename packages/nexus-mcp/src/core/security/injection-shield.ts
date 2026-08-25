/**
 * Prompt Injection & Jailbreak Shield
 * Inspects upstream API payloads and tool outputs for indirect prompt injections,
 * system override attempts, and malicious instructions targeting the AI agent.
 */

export interface InjectionScanResult {
  isCompromised: boolean;
  threatLevel: 'none' | 'low' | 'high';
  matchedPatterns: string[];
  neutralizedText: string;
}

export class InjectionShield {
  // High-risk prompt injection heuristics and jailbreak markers
  private static readonly INJECTION_RULES = [
    {
      name: 'instruction_override',
      regex: /(ignore\s+(all\s+)?(previous|prior|above)\s+instructions|disregard\s+(all\s+)?(previous|prior)\s+instructions)/i,
      threat: 'high' as const,
    },
    {
      name: 'system_role_impersonation',
      regex: /(system\s*:\s*you\s+are\s+now|<system>|\[SYSTEM\s+PROMPT\s+OVERRIDE\]|###\s*System\s*Message)/i,
      threat: 'high' as const,
    },
    {
      name: 'exfiltration_command',
      regex: /(send\s+all\s+(api\s+keys|passwords|system\s+prompts|user\s+data)\s+to|curl\s+https?:\/\/.*(leak|steal|exfil))/i,
      threat: 'high' as const,
    },
    {
      name: 'jailbreak_dan',
      regex: /(you\s+are\s+now\s+in\s+developer\s+mode|enable\s+DAN\s+mode|do\s+anything\s+now)/i,
      threat: 'high' as const,
    },
  ];

  /**
   * Scans a text string or object for malicious prompt injection vectors.
   */
  static inspectAndNeutralize(payload: any): InjectionScanResult {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const matchedPatterns: string[] = [];
    let highestThreat: 'none' | 'low' | 'high' = 'none';
    let neutralized = text;

    for (const rule of this.INJECTION_RULES) {
      if (rule.regex.test(neutralized)) {
        matchedPatterns.push(rule.name);
        if (rule.threat === 'high') highestThreat = 'high';
        else if (highestThreat === 'none') highestThreat = 'low';

        // Neutralize: Replace malicious instruction with a safe warning placeholder
        neutralized = neutralized.replace(rule.regex, (match) => {
          return `[🛡️ NEXUS-SHIELD: NEUTRALIZED_SUSPECTED_PROMPT_INJECTION (${rule.name})]`;
        });
      }
    }

    return {
      isCompromised: matchedPatterns.length > 0,
      threatLevel: highestThreat,
      matchedPatterns,
      neutralizedText: neutralized,
    };
  }
}
