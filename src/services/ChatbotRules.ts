export interface ChatbotRule {
  pattern: RegExp;
  handler: (matches: RegExpMatchArray) => Promise<string>;
  examples: string[];
  description: string;
}

export interface AttendanceQuery {
  employeeId?: string;
  employeeName?: string;
  departmentId?: string;
  startDate?: string;
  endDate?: string;
  type?: 'late' | 'present' | 'absent' | 'all';
}

export const extractDateFromText = (text: string): string | null => {
  const datePatterns = [
    /\b\d{4}-\d{2}-\d{2}\b/, // YYYY-MM-DD
    /\b\d{2}\/\d{2}\/\d{4}\b/, // DD/MM/YYYY
    /\b(?:today|tomorrow|yesterday)\b/i,
    /\b(?:last|next)\s+(?:week|month)\b/i,
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/i
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Convert matched date to YYYY-MM-DD format
      const date = new Date(match[0]);
      return date.toISOString().split('T')[0];
    }
  }
  return null;
};

export const extractEmployeeInfo = (text: string): { name?: string; id?: string } => {
  const nameMatch = text.match(/(?:employee|name)[\s:]+([a-zA-Z\s]+)/i);
  const idMatch = text.match(/(?:id|number)[\s:]+([A-Z0-9-]+)/i);

  return {
    name: nameMatch ? nameMatch[1].trim() : undefined,
    id: idMatch ? idMatch[1].trim() : undefined
  };
};

export const extractDepartment = (text: string): string | null => {
  const deptMatch = text.match(/(?:department|dept)[\s:]+([a-zA-Z\s]+)/i);
  return deptMatch ? deptMatch[1].trim() : null;
};

export const chatbotRules: ChatbotRule[] = [
  // Attendance Status Query
  {
    pattern: /(?:check|show|get|what is)\s+(?:the\s+)?attendance(?:\s+status)?\s+(?:for|of)\s+(.+?)(?:\s+on\s+(.+?))?\??$/i,
    handler: async (matches) => {
      const employeeInfo = extractEmployeeInfo(matches[1]);
      const date = matches[2] ? extractDateFromText(matches[2]) : new Date().toISOString().split('T')[0];
      
      // Here you would query your attendance database
      return `Checking attendance status for ${employeeInfo.name || employeeInfo.id} on ${date}...`;
    },
    examples: [
      "Check attendance for John Doe",
      "Show attendance status for employee ID: EMP123",
      "What is the attendance for Marketing department on 2024-02-20?"
    ],
    description: "Query attendance status for specific employees or departments"
  },

  // Late Arrivals Query
  {
    pattern: /(?:show|list|get)\s+(?:all\s+)?late\s+(?:arrivals?|employees?)(?:\s+(?:for|on|in)\s+(.+?))?\??$/i,
    handler: async (matches) => {
      const timeFrame = matches[1] || "today";
      const date = extractDateFromText(timeFrame) || new Date().toISOString().split('T')[0];
      
      // Query late arrivals
      return `Fetching late arrivals for ${timeFrame}...`;
    },
    examples: [
      "Show late arrivals for today",
      "List late employees in Marketing department",
      "Get all late arrivals for last week"
    ],
    description: "Query late arrival information"
  },

  // Attendance Report Generation
  {
    pattern: /(?:generate|create|prepare)\s+(?:an?\s+)?attendance\s+report(?:\s+for\s+(.+?))?\??$/i,
    handler: async (matches) => {
      const scope = matches[1] || "all departments";
      
      // Generate report
      return `Generating attendance report for ${scope}...`;
    },
    examples: [
      "Generate attendance report",
      "Create attendance report for Marketing department",
      "Prepare attendance report for last month"
    ],
    description: "Generate attendance reports"
  },

  // Working Hours Query
  {
    pattern: /(?:what are|show|check)\s+(?:the\s+)?working\s+hours(?:\s+for\s+(.+?))?\??$/i,
    handler: async (matches) => {
      const employeeInfo = matches[1] ? extractEmployeeInfo(matches[1]) : null;
      
      // Query working hours
      return employeeInfo 
        ? `Checking working hours for ${employeeInfo.name || employeeInfo.id}...`
        : "Showing standard working hours...";
    },
    examples: [
      "What are the working hours for John Doe?",
      "Show working hours for Marketing department",
      "Check working hours"
    ],
    description: "Query working hours information"
  },

  // Break Time Query
  {
    pattern: /(?:check|show|what is)\s+(?:the\s+)?break\s+(?:time|duration)(?:\s+for\s+(.+?))?\??$/i,
    handler: async (matches) => {
      const employeeInfo = matches[1] ? extractEmployeeInfo(matches[1]) : null;
      
      // Query break time
      return employeeInfo 
        ? `Checking break time for ${employeeInfo.name || employeeInfo.id}...`
        : "Showing standard break duration...";
    },
    examples: [
      "Check break time for John Doe",
      "Show break duration",
      "What is the break time for Marketing department?"
    ],
    description: "Query break time information"
  },

  // Roster Query
  {
    pattern: /(?:show|get|what is)\s+(?:the\s+)?roster(?:\s+for\s+(.+?))?\??$/i,
    handler: async (matches) => {
      const scope = matches[1] || "today";
      
      // Query roster
      return `Fetching roster information for ${scope}...`;
    },
    examples: [
      "Show roster for next week",
      "Get roster for Marketing department",
      "What is the roster for tomorrow?"
    ],
    description: "Query roster information"
  },

  // Department Statistics
  {
    pattern: /(?:show|get|calculate)\s+(?:the\s+)?(?:attendance\s+)?statistics(?:\s+for\s+(.+?))?\??$/i,
    handler: async (matches) => {
      const department = matches[1] ? extractDepartment(matches[1]) : "all departments";
      
      // Calculate statistics
      return `Calculating attendance statistics for ${department}...`;
    },
    examples: [
      "Show statistics for Marketing department",
      "Get attendance statistics",
      "Calculate statistics for last month"
    ],
    description: "Query attendance statistics"
  },

  // Help Command
  {
    pattern: /(?:help|commands|what can you do|how to use)\??$/i,
    handler: async () => {
      return `I can help you with:
1. Checking attendance status
2. Showing late arrivals
3. Generating attendance reports
4. Checking working hours
5. Showing break times
6. Displaying roster information
7. Calculating department statistics

Try asking questions like:
- "Check attendance for John Doe"
- "Show late arrivals for today"
- "Generate attendance report for Marketing department"`;
    },
    examples: [
      "help",
      "what can you do",
      "show commands"
    ],
    description: "Get help and list of available commands"
  }
];

export const findMatchingRule = (input: string): { rule: ChatbotRule; matches: RegExpMatchArray } | null => {
  for (const rule of chatbotRules) {
    const matches = input.match(rule.pattern);
    if (matches) {
      return { rule, matches };
    }
  }
  return null;
};
