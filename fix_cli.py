with open("src/app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient.js", "r") as f:
    content = f.read()

# Fix the broken line: "const [apiKeys,\n      modelRules, setApiKeys] = useState([]);"
# Should be: "const [apiKeys, setApiKeys] = useState([]);"
content = content.replace(
    "const [apiKeys,\n      modelRules, setApiKeys] = useState([]);",
    "const [apiKeys, setApiKeys] = useState([]);"
)

with open("src/app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient.js", "w") as f:
    f.write(content)
