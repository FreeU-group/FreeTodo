#!/usr/bin/env node

/**
 * 前端 i18n 硬编码检查脚本
 *
 * 用途：扫描前端代码，找出所有未做 i18n 适配的中文硬编码
 * 使用方法：node check-i18n.js
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  // 要扫描的目录
  scanDirs: ['app', 'components', 'lib'],
  // 要扫描的文件扩展名
  extensions: ['.tsx', '.ts'],
  // 要排除的目录
  excludeDirs: ['node_modules', '.next', 'dist', 'build'],
  // 要排除的文件
  excludeFiles: [
    'lib/i18n/locales/zh.ts',
    'lib/i18n/locales/en.ts',
    'lib/i18n/index.ts',
  ],
};

// 匹配中文字符的正则表达式
const CHINESE_REGEX = /[\u4e00-\u9fa5]+/g;

// 需要忽略的模式
const IGNORE_PATTERNS = [
  // 单行注释
  /\/\/.*/g,
  // 多行注释
  /\/\*[\s\S]*?\*\//g,
  // console.log 等调试语句
  /console\.(log|error|warn|info|debug)\([^)]*\)/g,
  // i18n 配置对象（已经在翻译文件中）
  /\bt\.[a-zA-Z_.]+/g,
];

// 存储结果
const results = {
  totalFiles: 0,
  scannedFiles: 0,
  filesWithIssues: 0,
  issues: [],
};

/**
 * 检查路径是否应该被排除
 */
function shouldExclude(filePath) {
  // 检查是否在排除目录中
  for (const dir of CONFIG.excludeDirs) {
    if (filePath.includes(`/${dir}/`) || filePath.includes(`\\${dir}\\`)) {
      return true;
    }
  }

  // 检查是否在排除文件列表中
  for (const file of CONFIG.excludeFiles) {
    if (filePath.endsWith(file.replace(/\//g, path.sep))) {
      return true;
    }
  }

  return false;
}

/**
 * 检查文件扩展名是否匹配
 */
function hasValidExtension(filePath) {
  return CONFIG.extensions.some(ext => filePath.endsWith(ext));
}

/**
 * 移除注释和需要忽略的内容
 */
function removeIgnoredContent(content) {
  let cleaned = content;

  // 移除所有需要忽略的模式
  for (const pattern of IGNORE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' '.repeat(10)); // 用空格替换以保持位置
  }

  return cleaned;
}

/**
 * 分析文件内容，找出中文硬编码
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const cleanedContent = removeIgnoredContent(content);
  const cleanedLines = cleanedContent.split('\n');

  const fileIssues = [];

  // 逐行检查
  cleanedLines.forEach((line, index) => {
    const matches = line.match(CHINESE_REGEX);

    if (matches && matches.length > 0) {
      // 获取原始行内容（未清理的）
      const originalLine = lines[index];

      // 进一步过滤：排除一些特殊情况
      const shouldReport = !isLineInSpecialContext(originalLine, content, index);

      if (shouldReport) {
        const chineseTexts = Array.from(new Set(matches)); // 去重

        fileIssues.push({
          line: index + 1,
          content: originalLine.trim(),
          chineseTexts: chineseTexts,
        });
      }
    }
  });

  return fileIssues;
}

/**
 * 检查是否在特殊上下文中（需要额外排除的情况）
 */
function isLineInSpecialContext(line, fullContent, lineIndex) {
  const trimmedLine = line.trim();

  // 排除：import 语句
  if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('export ')) {
    return true;
  }

  // 排除：type 或 interface 定义
  if (trimmedLine.startsWith('type ') || trimmedLine.startsWith('interface ')) {
    return true;
  }

  // 排除：已经使用了 t. 的行（说明已经做了 i18n）
  if (trimmedLine.includes('t.') || trimmedLine.includes('useTranslations')) {
    return true;
  }

  // 排除：在 i18n 配置对象中
  if (trimmedLine.match(/^[a-zA-Z_]+:\s*['"`]/)) {
    return true;
  }

  // 排除：URL 或路径
  if (trimmedLine.includes('http://') || trimmedLine.includes('https://') || trimmedLine.includes('://')) {
    return true;
  }

  return false;
}

/**
 * 递归扫描目录
 */
function scanDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (shouldExclude(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && hasValidExtension(fullPath)) {
      results.totalFiles++;

      try {
        const issues = analyzeFile(fullPath);
        results.scannedFiles++;

        if (issues.length > 0) {
          results.filesWithIssues++;
          results.issues.push({
            file: path.relative(process.cwd(), fullPath),
            issues: issues,
          });
        }
      } catch (error) {
        console.error(`❌ 处理文件失败: ${fullPath}`, error.message);
      }
    }
  }
}

/**
 * 生成报告
 */
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 前端 i18n 硬编码检查报告');
  console.log('='.repeat(80) + '\n');

  console.log(`📁 扫描目录: ${CONFIG.scanDirs.join(', ')}`);
  console.log(`📄 总文件数: ${results.totalFiles}`);
  console.log(`✅ 已扫描: ${results.scannedFiles}`);
  console.log(`⚠️  有问题的文件: ${results.filesWithIssues}\n`);

  if (results.issues.length === 0) {
    console.log('✨ 太棒了！没有发现中文硬编码问题。\n');
    return;
  }

  console.log('=' .repeat(80));
  console.log('🔍 发现的问题详情');
  console.log('='.repeat(80) + '\n');

  // 按文件分组显示
  results.issues.forEach((fileIssue, fileIndex) => {
    console.log(`\n📄 文件 ${fileIndex + 1}/${results.filesWithIssues}: ${fileIssue.file}`);
    console.log('-'.repeat(80));

    fileIssue.issues.forEach((issue, issueIndex) => {
      console.log(`\n  ${issueIndex + 1}. 第 ${issue.line} 行:`);
      console.log(`     中文内容: ${issue.chineseTexts.join(', ')}`);
      console.log(`     代码: ${issue.content}`);
    });

    console.log('');
  });

  // 统计总问题数
  const totalIssues = results.issues.reduce((sum, file) => sum + file.issues.length, 0);

  console.log('\n' + '='.repeat(80));
  console.log(`📌 总计发现 ${totalIssues} 处中文硬编码`);
  console.log('='.repeat(80) + '\n');

  // 给出建议
  console.log('💡 修复建议:');
  console.log('   1. 在 lib/i18n/locales/zh.ts 中添加对应的翻译键');
  console.log('   2. 在 lib/i18n/locales/en.ts 中添加对应的英文翻译');
  console.log('   3. 在组件中使用 const locale = useLocaleStore(state => state.locale)');
  console.log('   4. 在组件中使用 const t = useTranslations(locale)');
  console.log('   5. 将硬编码的中文替换为 t.xxx.xxx 的形式\n');
}

/**
 * 主函数
 */
function main() {
  console.log('🚀 开始扫描前端代码...\n');

  const startTime = Date.now();
  const frontendDir = path.join(process.cwd());

  // 检查是否在 frontend 目录
  if (!fs.existsSync(path.join(frontendDir, 'package.json'))) {
    console.error('❌ 错误: 请在 frontend 目录下运行此脚本');
    process.exit(1);
  }

  // 扫描每个目录
  for (const dir of CONFIG.scanDirs) {
    const dirPath = path.join(frontendDir, dir);
    if (fs.existsSync(dirPath)) {
      console.log(`📂 正在扫描: ${dir}/`);
      scanDirectory(dirPath);
    } else {
      console.log(`⚠️  目录不存在，跳过: ${dir}/`);
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n⏱️  扫描完成，耗时: ${duration}s\n`);

  // 生成报告
  generateReport();

  // 如果有问题，返回非零退出码
  if (results.filesWithIssues > 0) {
    process.exit(1);
  }
}

// 运行主函数
main();
