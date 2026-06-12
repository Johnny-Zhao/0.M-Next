package com.mnext.kernel.internal;

import com.mnext.kernel.api.commands.FieldUpdate;

record PreparedField(FieldUpdate update, FieldDefinition definition, FieldValueRow current) {}
