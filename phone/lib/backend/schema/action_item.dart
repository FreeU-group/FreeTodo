class ActionItemWithMetadata {
  final String id;
  final String description;
  final bool completed;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? dueAt;
  final DateTime? completedAt;
  final String? conversationId;
  final bool isLocked;
  final bool exported;
  final DateTime? exportDate;
  final String? exportPlatform;
  final String? status;
  final int sortOrder;
  final int indentLevel;

  ActionItemWithMetadata({
    required this.id,
    required this.description,
    required this.completed,
    this.createdAt,
    this.updatedAt,
    this.dueAt,
    this.completedAt,
    this.conversationId,
    this.isLocked = false,
    this.exported = false,
    this.exportDate,
    this.exportPlatform,
    this.status,
    this.sortOrder = 0,
    this.indentLevel = 0,
  });

  factory ActionItemWithMetadata.fromJson(Map<String, dynamic> json) {
    int _toInt(dynamic value, [int fallback = 0]) {
      if (value is int) return value;
      if (value is String) return int.tryParse(value) ?? fallback;
      return fallback;
    }

    DateTime? _parseDate(dynamic value) {
      if (value is! String || value.isEmpty) return null;
      return DateTime.tryParse(value)?.toLocal();
    }

    return ActionItemWithMetadata(
      id: (json['id'] ?? '').toString(),
      description: (json['description'] ?? json['name'] ?? json['summary'] ?? '').toString(),
      completed: json['completed'] ?? false,
      createdAt: _parseDate(json['created_at']),
      updatedAt: _parseDate(json['updated_at']),
      dueAt: _parseDate(json['due_at']),
      completedAt: _parseDate(json['completed_at']),
      conversationId: json['conversation_id']?.toString(),
      isLocked: json['is_locked'] ?? false,
      exported: json['exported'] ?? false,
      exportDate: _parseDate(json['export_date']),
      exportPlatform: json['export_platform']?.toString(),
      status: json['status']?.toString(),
      sortOrder: _toInt(json['sort_order']),
      indentLevel: _toInt(json['indent_level']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'description': description,
      'completed': completed,
      'created_at': createdAt?.toUtc().toIso8601String(),
      'updated_at': updatedAt?.toUtc().toIso8601String(),
      'due_at': dueAt?.toUtc().toIso8601String(),
      'completed_at': completedAt?.toUtc().toIso8601String(),
      'conversation_id': conversationId,
      'is_locked': isLocked,
      'exported': exported,
      'export_date': exportDate?.toUtc().toIso8601String(),
      'export_platform': exportPlatform,
      'status': status,
      'sort_order': sortOrder,
      'indent_level': indentLevel,
    };
  }

  ActionItemWithMetadata copyWith({
    String? id,
    String? description,
    bool? completed,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? dueAt,
    DateTime? completedAt,
    String? conversationId,
    bool? isLocked,
    bool? exported,
    DateTime? exportDate,
    String? exportPlatform,
    String? status,
    int? sortOrder,
    int? indentLevel,
  }) {
    return ActionItemWithMetadata(
      id: id ?? this.id,
      description: description ?? this.description,
      completed: completed ?? this.completed,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      dueAt: dueAt ?? this.dueAt,
      completedAt: completedAt ?? this.completedAt,
      conversationId: conversationId ?? this.conversationId,
      isLocked: isLocked ?? this.isLocked,
      exported: exported ?? this.exported,
      exportDate: exportDate ?? this.exportDate,
      exportPlatform: exportPlatform ?? this.exportPlatform,
      status: status ?? this.status,
      sortOrder: sortOrder ?? this.sortOrder,
      indentLevel: indentLevel ?? this.indentLevel,
    );
  }
}

class ActionItemsResponse {
  final List<ActionItemWithMetadata> actionItems;
  final bool hasMore;

  ActionItemsResponse({
    required this.actionItems,
    required this.hasMore,
  });

  factory ActionItemsResponse.fromJson(Map<String, dynamic> json) {
    return ActionItemsResponse(
      actionItems:
          (json['action_items'] as List<dynamic>).map((item) => ActionItemWithMetadata.fromJson(item)).toList(),
      hasMore: json['has_more'],
    );
  }
}
